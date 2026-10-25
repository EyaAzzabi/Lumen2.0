"""User-negotiated modeled limits, not flight safety limits."""

import math


def active_constraints(store, plan):
    return [
        dict(rule, source_notice_id=n["id"], source_revision=n.get("revision", 1))
        for n in store.notices()
        if n["plan_id"] == plan["id"]
        and n.get("revision", 1) == plan.get("revision", 1)
        and n["status"] != "acknowledged"
        for rule in n.get("constraints", [])
    ]


def evaluate(results, x, y, assets, rules):
    by_id = {r["asset_id"]: r for r in results}
    positions = {a["id"]: a for a in assets}
    checks = []
    for rule in rules:
        a = positions.get(rule["asset_id"])
        r = by_id.get(rule["asset_id"])
        damage = r["damage_fraction"] if r else None
        distance = math.hypot(x - a["x"], y - a["y"]) if a else None
        maximum = rule.get("max_damage_fraction")
        minimum = rule.get("min_separation_m")
        damage_pass = maximum is None or damage is not None and damage <= maximum
        distance_pass = minimum is None or distance is not None and distance >= minimum
        violations = []
        if not damage_pass:
            violations.append("mean_damage_limit")
        if not distance_pass:
            violations.append("minimum_separation")
        if a is None or r is None:
            violations.append("asset_unavailable")
        score = (
            max(0, damage - maximum) / max(maximum, 0.001)
            if maximum is not None and damage is not None
            else 0
        ) + (
            max(0, minimum - distance) / max(minimum, 1)
            if minimum is not None and distance is not None
            else 0
        )
        checks.append(
            {
                **rule,
                "actual_damage_fraction": damage,
                "actual_distance_m": distance,
                "satisfied": not violations,
                "violations": violations,
                "normalized_violation": score,
            }
        )
    return {
        "satisfied": all(c["satisfied"] for c in checks),
        "checks": checks,
        "violation_score": sum(c["normalized_violation"] for c in checks),
        "metric": "mean modeled damage over touchdown samples; nominal distance",
        "not_safety_certification": True,
    }
