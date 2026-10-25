"""Organization-owned mission drafts. Transactional version checks; no computed results trusted from clients."""

import json
import time
from fastapi import HTTPException
from .database import Conflict, uid, encode


def view(row):
    return {
        **{k: row[k] for k in row.keys() if k != "payload"},
        "data": json.loads(row["payload"]),
    }


def get(store, who, draft_id):
    who.require("private:read")
    with store.connect() as c:
        row = c.execute(
            "SELECT * FROM mission_drafts WHERE id=? AND organization_id=?",
            (draft_id, who.organization_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Draft not found in this organization")
    return view(row)


def listing(store, who):
    who.require("private:read")
    with store.connect() as c:
        return [
            view(r)
            for r in c.execute(
                "SELECT * FROM mission_drafts WHERE organization_id=? ORDER BY updated_at DESC",
                (who.organization_id,),
            )
        ]


def create(store, who, data, key):
    who.require("plans:write")
    if not key:
        raise HTTPException(400, "Idempotency-Key required")
    with store.transaction() as c:

        def write():
            draft_id = uid("DR-")
            now = time.time()
            c.execute(
                "INSERT INTO mission_drafts VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    draft_id,
                    who.organization_id,
                    who.user_id,
                    1,
                    "draft",
                    now,
                    now,
                    None,
                    encode(data),
                ),
            )
            store.event(
                c,
                "DRAFT_CREATED",
                who.user_id,
                who.organization_id,
                metadata={"draft_id": draft_id},
            )
            return view(
                c.execute(
                    "SELECT * FROM mission_drafts WHERE id=?", (draft_id,)
                ).fetchone()
            )

        return store.idempotent(
            c, "draft-create:" + who.organization_id, key, data, write
        )


def update(store, who, draft_id, version, data=None, status=None):
    who.require("plans:write")
    with store.transaction() as c:
        row = c.execute(
            "SELECT * FROM mission_drafts WHERE id=? AND organization_id=?",
            (draft_id, who.organization_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Draft not found in this organization")
        if row["version"] != version:
            raise Conflict(
                "Draft changed in another tab or by a teammate. Reload before saving."
            )
        if row["status"] == "filed":
            raise Conflict("Filed drafts are immutable; create a plan revision instead")
        if data is not None and row["status"] != "draft":
            raise Conflict("Restore the archived draft before editing")
        c.execute(
            "UPDATE mission_drafts SET payload=?,status=?,version=version+1,updated_at=? WHERE id=?",
            (
                encode(data) if data is not None else row["payload"],
                status or row["status"],
                time.time(),
                draft_id,
            ),
        )
        store.event(
            c,
            "DRAFT_" + (status.upper() if status else "SAVED"),
            who.user_id,
            who.organization_id,
            metadata={"draft_id": draft_id, "version": version + 1},
        )
        return view(
            c.execute("SELECT * FROM mission_drafts WHERE id=?", (draft_id,)).fetchone()
        )
