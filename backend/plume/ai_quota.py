"""Per-organization quota on language-model requests.

Every request that would reach a paid model (brief or question) is counted
for the caller's organization. Over the limit, no model is called: the copilot
answers from its deterministic template and says why. Template-only answers
(no model configured) are free and never counted.
"""

from __future__ import annotations

import math
import os
import time

MINUTE, DAY = 60.0, 86_400.0


def limits() -> tuple[int, int]:
    """(per minute, per day), read at call time so operators can tune them."""
    return (
        max(0, int(os.getenv("PLUME_AI_PER_MINUTE", "20"))),
        max(0, int(os.getenv("PLUME_AI_PER_DAY", "200"))),
    )


def reserve(store, organization_id: str, user_id: str, kind: str) -> str | None:
    """Count one model request. Returns None if allowed, else why it is refused."""
    per_minute, per_day = limits()
    now = time.time()
    with store.transaction() as c:
        c.execute("DELETE FROM ai_usage WHERE created_at<?", (now - DAY,))
        rows = c.execute(
            "SELECT created_at FROM ai_usage WHERE organization_id=? ORDER BY created_at",
            (organization_id,),
        ).fetchall()
        times = [r[0] for r in rows]
        recent = [t for t in times if t > now - MINUTE]
        if len(recent) >= per_minute:
            wait = max(1, math.ceil(recent[0] + MINUTE - now))
            return f"AI quota reached for your organization ({per_minute} per minute); retry in {wait} s"
        if len(times) >= per_day:
            wait = max(1, math.ceil((times[0] + DAY - now) / 3600))
            return f"daily AI quota reached for your organization ({per_day} per day); retry in about {wait} h"
        c.execute(
            "INSERT INTO ai_usage(organization_id,user_id,kind,created_at) VALUES(?,?,?,?)",
            (organization_id, user_id, kind, now),
        )
    return None


def usage(store, organization_id: str) -> dict:
    per_minute, per_day = limits()
    now = time.time()
    with store.connect() as c:
        minute = c.execute(
            "SELECT COUNT(*) FROM ai_usage WHERE organization_id=? AND created_at>?",
            (organization_id, now - MINUTE),
        ).fetchone()[0]
        day = c.execute(
            "SELECT COUNT(*) FROM ai_usage WHERE organization_id=? AND created_at>?",
            (organization_id, now - DAY),
        ).fetchone()[0]
    return {"per_minute": {"used": minute, "limit": per_minute}, "per_day": {"used": day, "limit": per_day}}
