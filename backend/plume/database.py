"""SQLite repository, versioned SQL migrations and non-destructive JSON import.

One connection per transaction; WAL, foreign keys and busy timeout. The repository
boundary permits a future PostgreSQL implementation; SQLite SQL is not a claim of
an already supported PostgreSQL deployment.
"""

from __future__ import annotations
from contextlib import contextmanager
import copy, hashlib, json, shutil, sqlite3, tempfile, time, uuid
from pathlib import Path


def uid(prefix):
    return prefix + uuid.uuid4().hex


def encode(value):
    return json.dumps(value, allow_nan=False, sort_keys=True)


def fingerprint(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


class Conflict(ValueError):
    pass


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


class Store:
    def __init__(self, path=None):
        from .store import DATA_FILE, SEED

        self.path = Path(path or DATA_FILE)
        self.db_path = (
            self.path
            if self.path.suffix in (".sqlite3", ".db")
            else self.path.with_suffix(".sqlite3")
        )
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            self._schema(c)
        with self.connect() as c:
            initialized = c.execute(
                "SELECT 1 FROM metadata WHERE key='initialized'"
            ).fetchone()
        if not initialized:
            if self.path.suffix == ".json" and self.path.exists():
                raw = self.path.read_bytes()
                data = json.loads(raw.decode("utf-8-sig"))
                # Validate a byte-for-byte copy with an independent database before importing real data.
                with tempfile.TemporaryDirectory(
                    prefix="plume-migration-check-"
                ) as directory:
                    source = Path(directory) / "state.json"
                    source.write_bytes(raw)
                    with sqlite3.connect(
                        Path(directory) / "check.db", factory=ClosingConnection
                    ) as trial:
                        trial.execute("PRAGMA foreign_keys=ON")
                        self._schema(trial)
                        self._import(
                            trial, json.loads(source.read_text(encoding="utf-8-sig"))
                        )
                        self._verify(trial, data)
                digest = hashlib.sha256(raw).hexdigest()
                backup = self.path.with_name(self.path.name + ".backup-" + digest[:12])
                if not backup.exists():
                    shutil.copy2(self.path, backup)
                if backup.read_bytes() != raw:
                    raise ValueError("JSON backup verification failed")
                with self.transaction() as c:
                    if c.execute(
                        "SELECT 1 FROM metadata WHERE key='initialized'"
                    ).fetchone():
                        return
                    if self.path.read_bytes() != raw:
                        raise ValueError(
                            "Legacy JSON changed during migration; retry after stopping old writers"
                        )
                    self._import(c, data)
                    self._verify(c, data)
                    self._meta(
                        c,
                        "migration",
                        {
                            "source_sha256": digest,
                            "backup": str(backup),
                            "counts": {
                                k: len(data[k])
                                for k in ("operators", "assets", "plans", "notices")
                            },
                            "verified": True,
                        },
                    )
            else:
                with self.transaction() as c:
                    if not c.execute(
                        "SELECT 1 FROM metadata WHERE key='initialized'"
                    ).fetchone():
                        self._import(c, copy.deepcopy(SEED))

    def connect(self):
        c = sqlite3.connect(self.db_path, timeout=15, factory=ClosingConnection)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA busy_timeout=15000")
        c.execute("PRAGMA journal_mode=WAL")
        return c

    @contextmanager
    def transaction(self):
        c = self.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    @staticmethod
    def _schema(c):
        for p in sorted((Path(__file__).parent / "migrations").glob("*.sql")):
            c.executescript(p.read_text(encoding="utf-8-sig"))

    @staticmethod
    def _meta(c, key, value):
        c.execute("INSERT OR REPLACE INTO metadata VALUES(?,?)", (key, encode(value)))

    def _import(self, c, data):
        if not isinstance(data, dict) or set(data) - {
            "operators",
            "assets",
            "plans",
            "notices",
        }:
            raise ValueError(
                "Migration contains unsupported top-level collections; explicit mapping required"
            )
        for k in ("operators", "assets", "plans", "notices"):
            if not isinstance(data.get(k), list):
                raise ValueError("Migration requires list: " + k)
            if not all(isinstance(r, dict) for r in data[k]):
                raise ValueError("Malformed record in " + k)
            ids = [r.get("id") for r in data[k]]
            if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(
                set(ids)
            ):
                raise ValueError("Invalid/duplicate IDs: " + k)
        organizations = {r["id"] for r in data["operators"]}
        plans = {r["id"] for r in data["plans"]}
        for group in ("assets", "plans"):
            for r in data[group]:
                if r.get("operator_id") not in organizations:
                    raise ValueError(
                        f"Migration {group}:{r['id']}: unknown organization"
                    )
        for r in data["plans"]:
            if not all(
                k in r
                for k in (
                    "lander",
                    "site",
                    "summary",
                    "name",
                    "window",
                    "status",
                    "created_at",
                )
            ):
                raise ValueError(f"Migration plans:{r['id']}: missing fields")
        for r in data["notices"]:
            if (
                r.get("plan_id") not in plans
                or r.get("from_operator_id") not in organizations
                or r.get("to_operator_id") not in organizations
            ):
                raise ValueError(f"Migration notices:{r['id']}: invalid relationship")
        for r in data["operators"]:
            c.execute("INSERT INTO organizations VALUES(?,?)", (r["id"], encode(r)))
        for r in data["assets"]:
            from .damage import ASSET_TYPES

            if (
                r["type"] not in ASSET_TYPES
                or not (-15000 <= r["x"] <= 15000 and -15000 <= r["y"] <= 15000)
                or r["value_meur"] <= 0
            ):
                raise ValueError("Malformed asset " + r["id"])
            c.execute(
                "INSERT INTO assets VALUES(?,?,?,NULL)",
                (r["id"], r["operator_id"], encode(r)),
            )
        for r in data["plans"]:
            rev_id = r["id"] + "-r1"
            c.execute(
                "INSERT INTO plans VALUES(?,?,?,?)",
                (r["id"], r["operator_id"], encode(r), r["created_at"]),
            )
            c.execute(
                "INSERT INTO revisions VALUES(?,?,?,?)",
                (
                    rev_id,
                    r["id"],
                    1,
                    encode({**r, "revision": 1, "revision_id": rev_id, "legacy": True}),
                ),
            )
            c.execute(
                "INSERT INTO assessments VALUES(?,?,?,?)",
                (
                    uid("RA-"),
                    rev_id,
                    encode(
                        {
                            "legacy": True,
                            "summary": r["summary"],
                            "provenance": {
                                "status": "historical full inputs unavailable; not reconstructed"
                            },
                        }
                    ),
                    r["created_at"],
                ),
            )
        for r in data["notices"]:
            c.execute(
                "INSERT INTO notices VALUES(?,?,?,?,?,?,?)",
                (
                    r["id"],
                    r["plan_id"],
                    r["plan_id"] + "-r1",
                    r["from_operator_id"],
                    r["to_operator_id"],
                    encode(r),
                    r["created_at"],
                ),
            )
            if r["status"] not in ("unread", "acknowledged", "objection"):
                raise ValueError("Invalid notice status " + r["id"])
            if r["status"] != "unread":
                c.execute(
                    "INSERT INTO responses VALUES(?,?,?,?,?,NULL)",
                    (
                        uid("NR-"),
                        r["id"],
                        None,
                        r["to_operator_id"],
                        encode(
                            {
                                "status": r["status"],
                                "reply": r.get("reply"),
                                "legacy": True,
                                "timestamp_unknown": True,
                            }
                        ),
                    ),
                )
        self._meta(c, "initialized", {"at": time.time()})

    @staticmethod
    def _verify(c, data):
        for key, table in [
            ("operators", "organizations"),
            ("assets", "assets"),
            ("plans", "plans"),
            ("notices", "notices"),
        ]:
            got = {
                r[0]: json.loads(r[1])
                for r in c.execute("SELECT id,payload FROM " + table)
            }
            if got != {r["id"]: r for r in data[key]}:
                raise ValueError("Migration verification failed: " + key)
        if c.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Migration foreign key check failed")

    def _list(self, table, where="", args=()):
        with self.connect() as c:
            return [
                json.loads(r[0])
                for r in c.execute("SELECT payload FROM " + table + " " + where, args)
            ]

    def operators(self):
        return self._list("organizations")

    def operator(self, op_id):
        return next((o for o in self.operators() if o["id"] == op_id), None)

    def assets(self):
        return self._list("assets", "WHERE deleted_at IS NULL")

    def asset(self, asset_id):
        return next((a for a in self.assets() if a["id"] == asset_id), None)

    def plans(self):
        return self._list("plans", "ORDER BY created_at DESC")

    def plan(self, plan_id):
        return next((p for p in self.plans() if p["id"] == plan_id), None)

    def notices(self, operator_id=None):
        return (
            self._list(
                "notices",
                "WHERE sender_id=? OR recipient_id=? ORDER BY created_at DESC",
                (operator_id, operator_id),
            )
            if operator_id
            else self._list("notices", "ORDER BY created_at DESC")
        )

    def notice(self, notice_id):
        return next((n for n in self.notices() if n["id"] == notice_id), None)

    def revisions(self, plan_id):
        return self._list("revisions", "WHERE plan_id=? ORDER BY number", (plan_id,))

    def assessment(self, revision_id):
        rows = self._list("assessments", "WHERE revision_id=?", (revision_id,))
        return rows[0] if rows else None

    def responses(self, notice_id):
        return self._list(
            "responses", "WHERE notice_id=? ORDER BY created_at", (notice_id,)
        )

    def events(self, plan_id):
        with self.connect() as c:
            return [
                {**dict(r), "metadata": json.loads(r["payload"])}
                for r in c.execute(
                    "SELECT * FROM events WHERE plan_id=? ORDER BY created_at,id",
                    (plan_id,),
                )
            ]

    def migration_report(self):
        with self.connect() as c:
            r = c.execute(
                "SELECT payload FROM metadata WHERE key='migration'"
            ).fetchone()
            return json.loads(r[0]) if r else {"source": "seed", "verified": True}

    def event(
        self,
        c,
        kind,
        actor=None,
        organization=None,
        plan_id=None,
        revision_id=None,
        metadata=None,
    ):
        c.execute(
            "INSERT INTO events VALUES(?,?,?,?,?,?,?,?)",
            (
                uid("EV-"),
                plan_id,
                revision_id,
                actor,
                organization,
                kind,
                encode(metadata or {}),
                time.time(),
            ),
        )

    def add_asset(self, asset, actor=None):
        asset = {**asset, "id": uid("a-")}
        with self.transaction() as c:
            if (
                c.execute(
                    "SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL"
                ).fetchone()[0]
                >= 200
            ):
                raise Conflict("Local registry limit is 200 active assets")
            c.execute(
                "INSERT INTO assets VALUES(?,?,?,NULL)",
                (asset["id"], asset["operator_id"], encode(asset)),
            )
            self.event(
                c,
                "ASSET_REGISTERED",
                actor,
                asset["operator_id"],
                metadata={"asset_id": asset["id"]},
            )
        return asset

    def delete_asset(self, asset_id, actor=None):
        with self.transaction() as c:
            row = c.execute(
                "SELECT organization_id FROM assets WHERE id=? AND deleted_at IS NULL",
                (asset_id,),
            ).fetchone()
            if not row:
                return False
            c.execute(
                "UPDATE assets SET deleted_at=? WHERE id=?", (time.time(), asset_id)
            )
            self.event(
                c, "ASSET_REMOVED", actor, row[0], metadata={"asset_id": asset_id}
            )
        return True

    # Compatibility for direct legacy fixtures. New API uses the revision service.
    def add_plan(self, plan, notices):
        return self.file_revision(
            plan,
            notices,
            {"legacy": True, "summary": plan["summary"]},
            "legacy-fixture",
            None,
            None,
        )

    def set_notice_status(self, notice_id, status, reply=None):
        n = self.notice(notice_id)
        return (
            self.respond(notice_id, status, reply, [], None, n["to_operator_id"], None)
            if n
            else None
        )

    def idempotent(self, c, scope, key, body, action):
        if key:
            row = c.execute(
                "SELECT request_hash,payload FROM idempotency WHERE scope=? AND key=?",
                (scope, key),
            ).fetchone()
            if row:
                if row[0] != fingerprint(body):
                    raise Conflict("Idempotency key reused with different request")
                return json.loads(row[1])
        result = action()
        if key:
            c.execute(
                "INSERT INTO idempotency VALUES(?,?,?,?)",
                (scope, key, fingerprint(body), encode(result)),
            )
        return result

    def file_revision(
        self,
        plan,
        notices,
        snapshot,
        actor,
        plan_id,
        key,
        expected_revision=None,
        request_body=None,
    ):
        with self.transaction() as c:

            def write():
                old = None
                if plan_id:
                    row = c.execute(
                        "SELECT payload FROM plans WHERE id=?", (plan_id,)
                    ).fetchone()
                    if not row:
                        raise Conflict("Unknown plan")
                    old = json.loads(row[0])
                    if (
                        old["operator_id"] != plan["operator_id"]
                        or old["status"] == "withdrawn"
                    ):
                        raise Conflict("Plan cannot be revised")
                    current = len(
                        c.execute(
                            "SELECT id FROM revisions WHERE plan_id=?", (plan_id,)
                        ).fetchall()
                    )
                    if expected_revision != current:
                        raise Conflict("Stale revision; reload current plan")
                    number = current + 1
                else:
                    number = 1
                pid = plan_id or uid("LP-")
                rid = pid + "-r" + str(number)
                now = time.time()
                # Previous recipients must explicitly review the new revision even if computed damage falls.
                recipients = {n["to_operator_id"] for n in notices}
                if old:
                    for row in c.execute(
                        "SELECT DISTINCT recipient_id FROM notices WHERE plan_id=?",
                        (pid,),
                    ):
                        if row[0] not in recipients:
                            notices.append(
                                {
                                    "from_operator_id": plan["operator_id"],
                                    "to_operator_id": row[0],
                                    "asset_ids": [],
                                    "max_risk": "negligible",
                                    "expected_loss_meur": 0,
                                    "subject": "Review revised proposal "
                                    + plan["name"],
                                    "body": "Previous consultation recipient: review the new revision and its assessment. Earlier responses remain in history.",
                                }
                            )
                            recipients.add(row[0])
                status = "awaiting_responses" if notices else "filed"
                saved = {
                    **plan,
                    "id": pid,
                    "revision": number,
                    "revision_id": rid,
                    "status": status,
                    "created_at": old["created_at"] if old else now,
                    "updated_at": now,
                }
                if old:
                    c.execute(
                        "UPDATE plans SET payload=? WHERE id=?", (encode(saved), pid)
                    )
                else:
                    c.execute(
                        "INSERT INTO plans VALUES(?,?,?,?)",
                        (pid, plan["operator_id"], encode(saved), now),
                    )
                c.execute(
                    "INSERT INTO revisions VALUES(?,?,?,?)",
                    (rid, pid, number, encode(saved)),
                )
                c.execute(
                    "INSERT INTO assessments VALUES(?,?,?,?)",
                    (uid("RA-"), rid, encode(snapshot), now),
                )
                for n in notices:
                    item = {
                        **n,
                        "id": uid("N-"),
                        "plan_id": pid,
                        "revision_id": rid,
                        "revision": number,
                        "created_at": now,
                        "read_at": None,
                        "responded_at": None,
                        "status": "unread",
                    }
                    c.execute(
                        "INSERT INTO notices VALUES(?,?,?,?,?,?,?)",
                        (
                            item["id"],
                            pid,
                            rid,
                            item["from_operator_id"],
                            item["to_operator_id"],
                            encode(item),
                            now,
                        ),
                    )
                    self.event(
                        c,
                        "NOTICE_CREATED",
                        actor,
                        plan["operator_id"],
                        pid,
                        rid,
                        {"notice_id": item["id"], "recipient": item["to_operator_id"]},
                    )
                self.event(
                    c,
                    "PLAN_REVISED" if old else "PLAN_FILED",
                    actor,
                    plan["operator_id"],
                    pid,
                    rid,
                )
                self.event(
                    c,
                    "REASSESSMENT_COMPLETED" if old else "RISK_ASSESSED",
                    actor,
                    plan["operator_id"],
                    pid,
                    rid,
                    {"summary": plan["summary"]},
                )
                return saved

            return self.idempotent(
                c,
                "file:" + str(plan_id) + ":" + plan["operator_id"],
                key,
                request_body or {"plan": plan, "expected_revision": expected_revision},
                write,
            )

    def respond(self, notice_id, status, reply, asset_ids, actor, organization, key):
        with self.transaction() as c:

            def write():
                row = c.execute(
                    "SELECT payload FROM notices WHERE id=?", (notice_id,)
                ).fetchone()
                if not row:
                    raise Conflict("Unknown notice")
                n = json.loads(row[0])
                p = json.loads(
                    c.execute(
                        "SELECT payload FROM plans WHERE id=?", (n["plan_id"],)
                    ).fetchone()[0]
                )
                if n["to_operator_id"] != organization:
                    raise Conflict("Wrong recipient")
                if (
                    n.get("revision_id", n["plan_id"] + "-r1")
                    != p.get("revision_id", p["id"] + "-r1")
                    or p["status"] == "withdrawn"
                ):
                    raise Conflict("Only current active revision can receive responses")
                if not set(asset_ids).issubset(n["asset_ids"]):
                    raise Conflict("Asset references outside consultation")
                now = time.time()
                payload = {
                    "id": uid("NR-"),
                    "status": status,
                    "reply": reply,
                    "asset_ids": asset_ids,
                    "actor_id": actor,
                    "organization_id": organization,
                    "revision_id": n.get("revision_id"),
                    "created_at": now,
                }
                c.execute(
                    "INSERT INTO responses VALUES(?,?,?,?,?,?)",
                    (
                        payload["id"],
                        notice_id,
                        actor,
                        organization,
                        encode(payload),
                        now,
                    ),
                )
                n.update(
                    status=status,
                    reply=reply,
                    read_at=n.get("read_at") or now,
                    responded_at=now,
                )
                c.execute(
                    "UPDATE notices SET payload=? WHERE id=?", (encode(n), notice_id)
                )
                self.event(
                    c,
                    (
                        "OBJECTION_SUBMITTED"
                        if status == "objection"
                        else "NOTICE_ACKNOWLEDGED"
                    ),
                    actor,
                    organization,
                    p["id"],
                    p.get("revision_id"),
                    {"notice_id": notice_id, "response_id": payload["id"]},
                )
                current = [
                    json.loads(r[0])
                    for r in c.execute(
                        "SELECT payload FROM notices WHERE revision_id=?",
                        (p.get("revision_id", p["id"] + "-r1"),),
                    )
                ]
                new = (
                    "objection_received"
                    if any(i["status"] == "objection" for i in current)
                    else (
                        "coordinated"
                        if current
                        and all(i["status"] == "acknowledged" for i in current)
                        else "awaiting_responses"
                    )
                )
                if new == "coordinated" and p["status"] != "coordinated":
                    self.event(
                        c,
                        "CONSULTATION_RESOLVED",
                        actor,
                        organization,
                        p["id"],
                        p.get("revision_id"),
                        {
                            "meaning": "all current recipients acknowledged; not safety certification"
                        },
                    )
                p["status"] = new
                p["updated_at"] = now
                c.execute("UPDATE plans SET payload=? WHERE id=?", (encode(p), p["id"]))
                return n

            return self.idempotent(
                c,
                "response:" + notice_id + ":" + organization,
                key,
                {"status": status, "reply": reply, "asset_ids": asset_ids},
                write,
            )

    def mark_read(self, notice_id, actor, organization):
        with self.transaction() as c:
            n = json.loads(
                c.execute(
                    "SELECT payload FROM notices WHERE id=?", (notice_id,)
                ).fetchone()[0]
            )
            n["read_at"] = n.get("read_at") or time.time()
            c.execute("UPDATE notices SET payload=? WHERE id=?", (encode(n), notice_id))
        return n

    def withdraw(self, plan_id, actor, organization):
        with self.transaction() as c:
            p = json.loads(
                c.execute(
                    "SELECT payload FROM plans WHERE id=?", (plan_id,)
                ).fetchone()[0]
            )
            if p["status"] != "withdrawn":
                p["status"] = "withdrawn"
                p["updated_at"] = time.time()
                c.execute("UPDATE plans SET payload=? WHERE id=?", (encode(p), plan_id))
                self.event(
                    c,
                    "PLAN_WITHDRAWN",
                    actor,
                    organization,
                    plan_id,
                    p.get("revision_id"),
                )
        return p
