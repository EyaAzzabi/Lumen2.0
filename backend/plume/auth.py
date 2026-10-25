"""Configuration and explicit local-only demo session boundary.

No production identity provider is implemented. Production fails closed instead
of trusting a header or a client-provided organization ID.
"""

from dataclasses import dataclass, field
import hashlib, ipaddress, os, secrets, time
from urllib.parse import urlparse
from fastapi import HTTPException, Request

ROLES = {
    "platform_admin": {
        "assets:write",
        "plans:write",
        "notices:respond",
        "private:read",
    },
    "organization_admin": {
        "assets:write",
        "plans:write",
        "notices:respond",
        "private:read",
    },
    "mission_operator": {"plans:write", "private:read"},
    "asset_manager": {"assets:write", "private:read"},
    "reviewer": {"notices:respond", "private:read"},
    "read_only": {"private:read"},
}


@dataclass
class Settings:
    environment: str = field(
        default_factory=lambda: os.getenv("PLUME_ENV", "development")
    )
    demo: bool = field(
        default_factory=lambda: os.getenv("PLUME_DEMO_AUTH", "").lower() == "true"
    )
    cors_origins: list[str] = field(
        default_factory=lambda: [
            x.strip()
            for x in os.getenv(
                "PLUME_CORS_ORIGINS",
                "http://localhost:5174,http://localhost:5173,http://127.0.0.1:8001,http://127.0.0.1:8002",
            ).split(",")
            if x.strip()
        ]
    )

    def validate(self):
        if self.environment not in ("development", "test", "production"):
            raise RuntimeError("Invalid PLUME_ENV")
        if "*" in self.cors_origins:
            raise RuntimeError("Wildcard CORS is forbidden")
        if self.environment == "production":
            raise RuntimeError(
                "Production identity provider adapter is not implemented; refusing to start"
            )
        return self


@dataclass(frozen=True)
class Identity:
    user_id: str
    organization_id: str
    roles: tuple[str, ...]
    demo: bool = True

    @property
    def permissions(self):
        return sorted(set().union(*(ROLES.get(r, set()) for r in self.roles)))

    def require(self, permission, organization=None):
        if permission not in self.permissions or (
            organization and organization != self.organization_id
        ):
            raise HTTPException(403, "Organization or permission denied")


def local_request(request):
    try:
        local = ipaddress.ip_address(request.client.host).is_loopback
    except (ValueError, AttributeError):
        local = False
    host = request.url.hostname
    if (
        not local
        or host not in ("localhost", "127.0.0.1", "::1")
        or request.headers.get("forwarded")
        or request.headers.get("x-forwarded-for")
    ):
        raise HTTPException(403, "Demo sessions require a direct loopback connection")
    origin = request.headers.get("origin")
    if origin and urlparse(origin).netloc != request.url.netloc:
        raise HTTPException(403, "Cross-origin demo request denied")


COOKIE = "plume_demo_session"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def create_session(request, response, store, settings, organization):
    if not settings.demo or settings.environment == "production":
        raise HTTPException(403, "Local demo authentication is disabled")
    local_request(request)
    if not store.operator(organization):
        raise HTTPException(404, "Unknown organization")
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    user = "demo:" + organization
    expires = time.time() + 8 * 3600
    with store.transaction() as c:
        old = request.cookies.get(COOKIE)
        if old:
            c.execute("DELETE FROM sessions WHERE id_hash=?", (digest(old),))
        c.execute("DELETE FROM sessions WHERE expires_at<?", (time.time(),))
        c.execute("INSERT OR IGNORE INTO users VALUES(?,?,?)", (user, 1, time.time()))
        c.execute(
            "INSERT OR IGNORE INTO memberships VALUES(?,?,?)",
            (user, organization, "organization_admin"),
        )
        c.execute(
            "INSERT INTO sessions VALUES(?,?,?,?,?)",
            (digest(token), user, organization, csrf, expires),
        )
        store.event(c, "DEMO_SESSION_CREATED", user, organization)
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="strict",
        secure=False,
        max_age=8 * 3600,
        path="/",
    )
    return {
        "authenticated": True,
        "demo_enabled": True,
        "demo": True,
        "user_id": user,
        "organization_id": organization,
        "roles": ["organization_admin"],
        "permissions": Identity(
            user, organization, ("organization_admin",)
        ).permissions,
        "csrf_token": csrf,
    }


def identity(request, store, settings, csrf=True):
    if not settings.demo:
        raise HTTPException(401, "Authentication required; local demo is disabled")
    local_request(request)
    token = request.cookies.get(COOKIE)
    with store.connect() as c:
        row = c.execute(
            "SELECT * FROM sessions WHERE id_hash=? AND expires_at>?",
            (digest(token or ""), time.time()),
        ).fetchone()
        if not row:
            raise HTTPException(401, "Authentication required")
        roles = tuple(
            r[0]
            for r in c.execute(
                "SELECT role FROM memberships WHERE user_id=? AND organization_id=?",
                (row["user_id"], row["organization_id"]),
            )
        )
    if (
        csrf
        and request.method not in ("GET", "HEAD", "OPTIONS")
        and not secrets.compare_digest(
            request.headers.get("x-plume-csrf", ""), row["csrf"]
        )
    ):
        raise HTTPException(403, "CSRF token required")
    return Identity(row["user_id"], row["organization_id"], roles)
