"""Eya's account flows adapted to the V2 transactional and cookie boundaries."""

import hashlib, sqlite3, time
from fastapi import HTTPException
from . import auth, passwords
from .database import uid, encode


def public_user(store, user_id):
    with store.connect() as c:
        r = c.execute(
            "SELECT a.*,u.demo FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.user_id=?",
            (user_id,),
        ).fetchone()
        if not r:
            return None
        roles = [
            row[0]
            for row in c.execute(
                "SELECT role FROM memberships WHERE user_id=? AND organization_id=?",
                (user_id, r["organization_id"]),
            )
        ]
    return {
        "id": user_id,
        "email": r["email"],
        "name": r["name"],
        "operator_id": r["organization_id"],
        "role": "admin" if "organization_admin" in roles else "member",
        "demo": bool(r["demo"]),
    }


def session_payload(request, response, store, settings, user_id):
    user = public_user(store, user_id)
    if not user:
        raise HTTPException(401, "Sign in required")
    if user["demo"]:
        if not settings.demo:
            raise HTTPException(403, "Demo accounts are disabled")
        auth.local_request(request)
    org = store.operator(user["operator_id"])
    with store.connect() as c:
        roles = tuple(
            r[0]
            for r in c.execute(
                "SELECT role FROM memberships WHERE user_id=? AND organization_id=?",
                (user_id, user["operator_id"]),
            )
        )
        if user["role"] == "admin":
            row = c.execute(
                "SELECT code FROM organization_invites WHERE organization_id=?",
                (user["operator_id"],),
            ).fetchone()
            if row:
                org = {**org, "invite_code": row[0]}
    token = passwords.new_token()
    csrf = passwords.new_token()
    with store.transaction() as c:
        old = request.cookies.get(auth.COOKIE)
        if old:
            c.execute("DELETE FROM sessions WHERE id_hash=?", (auth.digest(old),))
        c.execute("DELETE FROM sessions WHERE expires_at<?", (time.time(),))
        c.execute(
            "INSERT INTO sessions VALUES(?,?,?,?,?)",
            (
                auth.digest(token),
                user_id,
                user["operator_id"],
                csrf,
                time.time() + passwords.SESSION_TTL_S,
            ),
        )
        store.event(c, "ACCOUNT_SIGNED_IN", user_id, user["operator_id"])
    response.set_cookie(
        auth.COOKIE,
        token,
        httponly=True,
        samesite="strict",
        secure=False,
        max_age=passwords.SESSION_TTL_S,
        path="/",
    )
    return {
        "authenticated": True,
        "demo_enabled": settings.demo,
        "demo": user["demo"],
        "user_id": user_id,
        "organization_id": user["operator_id"],
        "roles": list(roles),
        "permissions": auth.Identity(
            user_id, user["operator_id"], roles, user["demo"]
        ).permissions,
        "csrf_token": csrf,
        "user": user,
        "organization": org,
    }


def account_view(store, who):
    user = public_user(store, who.user_id)
    if not user:
        raise HTTPException(401, "Password account required")
    org = store.operator(who.organization_id)
    if user["role"] == "admin":
        with store.connect() as c:
            row = c.execute(
                "SELECT code FROM organization_invites WHERE organization_id=?",
                (who.organization_id,),
            ).fetchone()
            if row:
                org = {**org, "invite_code": row[0]}
    return {"user": user, "organization": org}


def signup(body, store):
    email = passwords.normalize_email(body.email)
    if len(body.name.strip()) < 2:
        raise HTTPException(422, "Enter your name")
    if not passwords.valid_email(email) or email.endswith("@plume.demo"):
        raise HTTPException(422, "Enter a valid non-demo email address")
    hashed = passwords.hash_password(body.password)
    try:
        with store.transaction() as c:
            if c.execute("SELECT 1 FROM accounts WHERE email=?", (email,)).fetchone():
                raise HTTPException(409, "An account with this email already exists")
            if body.organization == "create":
                name = (body.organization_name or "").strip()
                if len(name) < 2:
                    raise HTTPException(422, "Enter an organization name")
                if any(
                    o["name"].casefold() == name.casefold() for o in store.operators()
                ):
                    raise HTTPException(
                        409, "Organization already exists; use its invitation"
                    )
                oid = uid("org-")
                org = {
                    "id": oid,
                    "name": name,
                    "short": "".join(w[0] for w in name.split()[:3]).upper(),
                    "color": "#22d3ee",
                }
                c.execute("INSERT INTO organizations VALUES(?,?)", (oid, encode(org)))
                c.execute(
                    "INSERT INTO organization_names VALUES(?,?)", (name.casefold(), oid)
                )
                c.execute(
                    "INSERT INTO organization_invites VALUES(?,?)",
                    (oid, passwords.new_invite_code()),
                )
                roles = ("organization_admin",)
            else:
                row = c.execute(
                    "SELECT organization_id FROM organization_invites WHERE code=?",
                    ((body.invite_code or "").strip().upper(),),
                ).fetchone()
                if not row:
                    raise HTTPException(404, "Invalid invite code")
                oid = row[0]
                roles = ("mission_operator", "asset_manager", "reviewer")
            user = uid("u-")
            c.execute("INSERT INTO users VALUES(?,?,?)", (user, 0, time.time()))
            c.execute(
                "INSERT INTO accounts VALUES(?,?,?,?,?)",
                (user, email, body.name, hashed, oid),
            )
            for role in roles:
                c.execute("INSERT INTO memberships VALUES(?,?,?)", (user, oid, role))
            store.event(c, "ACCOUNT_REGISTERED", user, oid)
        return user
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "Account or organization already exists") from exc


def login(body, request, store, settings):
    email = passwords.normalize_email(body.email)
    key = hashlib.sha256((request.client.host + ":" + email).encode()).hexdigest()
    now = time.time()
    with store.transaction() as c:
        c.execute("DELETE FROM login_attempts WHERE window_start<?", (now - 60,))
        row = c.execute(
            "SELECT attempts FROM login_attempts WHERE key=?", (key,)
        ).fetchone()
        if row and row[0] >= 10:
            raise HTTPException(429, "Too many sign-in attempts; retry later")
        c.execute(
            "INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
            (key, now),
        )
        r = c.execute(
            "SELECT a.*,u.demo FROM accounts a JOIN users u ON u.id=a.user_id WHERE email=?",
            (email,),
        ).fetchone()
    # Same hashing work for unknown email; no account enumeration via messages.
    good = passwords.verify_password(
        body.password, r["password_hash"] if r else DUMMY_HASH
    )
    if not r or not good:
        raise HTTPException(401, "Incorrect email or password")
    if r["demo"] and not settings.demo:
        raise HTTPException(403, "Demo accounts are disabled")
    with store.transaction() as c:
        c.execute("DELETE FROM login_attempts WHERE key=?", (key,))
    return r["user_id"]


DUMMY_HASH = passwords.hash_password("not-a-user-password")


def demo_accounts(store, settings):
    if not settings.demo:
        return []
    # Only the original fictional organizations; never seed known passwords for real organizations.
    from .store import SEED

    out = []
    with store.transaction() as c:
        for org in SEED["operators"]:
            if not c.execute(
                "SELECT 1 FROM organizations WHERE id=?", (org["id"],)
            ).fetchone():
                continue
            email = org["id"] + "@plume.demo"
            user = "account-demo:" + org["id"]
            if not c.execute(
                "SELECT 1 FROM accounts WHERE email=?", (email,)
            ).fetchone():
                c.execute(
                    "INSERT OR IGNORE INTO users VALUES(?,?,?)", (user, 1, time.time())
                )
                c.execute(
                    "INSERT INTO accounts VALUES(?,?,?,?,?)",
                    (
                        user,
                        email,
                        org["name"] + " (demo)",
                        passwords.hash_password(passwords.DEMO_PASSWORD),
                        org["id"],
                    ),
                )
                c.execute(
                    "INSERT OR IGNORE INTO memberships VALUES(?,?,?)",
                    (user, org["id"], "organization_admin"),
                )
                c.execute(
                    "INSERT OR IGNORE INTO organization_invites VALUES(?,?)",
                    (org["id"], passwords.new_invite_code()),
                )
            out.append(
                {
                    "email": email,
                    "organization": org["name"],
                    "operator_id": org["id"],
                    "password": passwords.DEMO_PASSWORD,
                }
            )
    return out


def members(store, organization_id):
    """People with a password account in one organization (no secrets)."""
    with store.connect() as c:
        rows = c.execute(
            "SELECT a.user_id, a.name, a.email, u.created_at, u.demo FROM accounts a "
            "JOIN users u ON u.id=a.user_id WHERE a.organization_id=? ORDER BY u.created_at",
            (organization_id,),
        ).fetchall()
        out = []
        for r in rows:
            roles = {
                row[0]
                for row in c.execute(
                    "SELECT role FROM memberships WHERE user_id=? AND organization_id=?",
                    (r["user_id"], organization_id),
                )
            }
            out.append({
                "id": r["user_id"],
                "name": r["name"],
                "email": r["email"],
                "role": "admin" if "organization_admin" in roles else "member",
                "joined_at": r["created_at"],
                "demo": bool(r["demo"]),
            })
    return out
