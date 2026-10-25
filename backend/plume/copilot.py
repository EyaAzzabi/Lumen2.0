"""Language layer: briefings for the landing operator and formal notices for
neighbours.

Safety numbers always come from the physics engine. Claude only explains them
and proposes mitigations; it never computes or changes a risk figure. If the
API is unreachable (offline demo, no credentials) a deterministic template is
used instead, and the response says which path produced the text.
"""

from __future__ import annotations

import json
import os
import re
import time

from .damage import ASSET_TYPES

MODEL = os.getenv("PLUME_LLM_MODEL", "claude-opus-5-5")

SYSTEM = """You are PLUME's coordination copilot for lunar landing operations.
You receive a landing plan and a physics-based ejecta risk assessment computed by
PLUME's engine. Write a concise briefing for the landing operator's flight
director.

Rules:
- Use ONLY the numbers given in the assessment. Never invent or recompute figures.
- Say plainly which neighbouring assets are at risk and why (distance, line of
  sight, terrain shielding, damage mechanism: erosion, impact or dust coating).
- Propose concrete mitigations drawn from: moving the touchdown point, terrain
  shielding behind ridges/crater rims, shorter low-altitude hover, scheduling
  while neighbours stow sensitive surfaces (arrays feathered edge-on, telescope
  covers closed), and prior consultation under the Artemis Accords "harmful
  interference" principle.
- State the main model limitations in one line.
- Format: Markdown, at most ~180 words, headings "Situation", "Risk drivers",
  "Recommended actions". No preamble."""


def _fmt_meur(x: float) -> str:
    return f"€{x:,.2f}M" if x < 10 else f"€{x:,.1f}M"


def _assessment_digest(
    assets_by_id: dict, operators: dict, assessment: dict
) -> list[dict]:
    rows = []
    for r in sorted(assessment["assets"], key=lambda r: -r["expected_loss_meur"]):
        a = assets_by_id[r["asset_id"]]
        rows.append(
            {
                "asset": a["name"],
                "owner": operators[a["operator_id"]]["name"],
                "type": ASSET_TYPES[a["type"]].label,
                "distance_km": round(r["distance_m"] / 1000, 2),
                "risk": r["risk"],
                "expected_damage_pct": round(r["damage_fraction"] * 100, 2),
                "expected_loss": _fmt_meur(r["expected_loss_meur"]),
                "dominant_mechanism": max(r["mechanisms"], key=r["mechanisms"].get),
                "terrain_shielded": r["shielded"],
            }
        )
    return rows


def _template_brief(
    lander: dict, assessment: dict, digest: list[dict], optimized: dict | None
) -> str:
    s = assessment["summary"]
    at_risk = [d for d in digest if d["risk"] in ("elevated", "critical")]
    lines = [
        "### Situation",
        f"{lander['label']} ({lander['thrust_kn']:.0f} kN, {lander['hover_s']:.0f} s low hover) at the "
        f"requested site exposes neighbours to an expected loss of {_fmt_meur(s['expected_loss_meur'])}.",
        "",
        "### Risk drivers",
    ]
    if at_risk:
        for d in at_risk:
            lines.append(
                f"- **{d['asset']}** ({d['owner']}): {d['risk']}, {d['expected_damage_pct']}% damage, "
                f"{d['expected_loss']} — mainly {d['dominant_mechanism']} at {d['distance_km']} km."
            )
    else:
        lines.append("- No asset above *low* risk.")
    shielded = [d["asset"] for d in digest if d["terrain_shielded"]]
    if shielded:
        lines.append(
            f"- Nominal modeled exposure is near zero for: {', '.join(shielded)}."
        )
    lines += ["", "### Recommended actions"]
    if optimized:
        lines.append(
            f"- Move touchdown to the optimised site: expected loss drops to "
            f"{_fmt_meur(optimized['summary']['expected_loss_meur'])}."
        )
    lines += [
        "- Ask affected operators to stow sensitive surfaces during the landing window.",
        "- Minimise low-altitude hover time; send a formal consultation notice before the window.",
    ]
    return "\n".join(lines)


def brief(
    lander: dict,
    assessment: dict,
    assets: list[dict],
    operators: list[dict],
    optimized: dict | None = None,
) -> dict:
    assets_by_id = {a["id"]: a for a in assets}
    ops = {o["id"]: o for o in operators}
    digest = _assessment_digest(assets_by_id, ops, assessment)
    payload = {
        "lander": lander,
        "site": assessment["site"],
        "total_expected_loss": _fmt_meur(assessment["summary"]["expected_loss_meur"]),
        "assets": digest,
    }
    if optimized:
        payload["optimised_alternative"] = {
            "site": optimized["site"],
            "total_expected_loss": _fmt_meur(
                optimized["summary"]["expected_loss_meur"]
            ),
            "assets": _assessment_digest(assets_by_id, ops, optimized),
        }
    t0 = time.perf_counter()
    try:
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError("LLM not configured")
        import anthropic

        client = anthropic.Anthropic(timeout=12.0, max_retries=0)
        response = client.messages.create(
            model=MODEL,
            max_tokens=900,
            system=SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": "Landing plan and assessment:\n"
                    + json.dumps(payload, indent=1),
                }
            ],
        )
        client.close()
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        allowed = set(re.findall(r"\d+(?:[.,]\d+)*", json.dumps(payload)))
        # Conservative token check, not a semantic truth validator. Unrecognized numbers fall back.
        if not set(re.findall(r"\d+(?:[.,]\d+)*", text)).issubset(allowed):
            raise ValueError("Narrative contains unsupported numeric tokens")
        if response.stop_reason == "refusal" or not text:
            raise RuntimeError("no usable text")
        return {
            "markdown": text,
            "source": "claude",
            "model": response.model,
            "numeric_validation": "literal tokens checked against input; semantics not certified",
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        }
    except (
        Exception
    ) as exc:  # offline / no credentials / API error: never break the demo
        if "client" in locals():
            client.close()
        return {
            "markdown": _template_brief(lander, assessment, digest, optimized),
            "source": "template",
            "reason": type(exc).__name__,
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        }


def notices_for_plan(
    plan: dict,
    assessment: dict,
    assets: list[dict],
    operators: list[dict],
    include_recipients=None,
) -> list[dict]:
    """Formal consultation notices, one per affected neighbouring operator."""
    assets_by_id = {a["id"]: a for a in assets}
    ops = {o["id"]: o for o in operators}
    sender = ops[plan["operator_id"]]
    by_owner: dict[str, list[dict]] = {}
    for r in assessment["assets"]:
        a = assets_by_id[r["asset_id"]]
        if a["operator_id"] == plan["operator_id"] or (
            r["risk"] == "negligible"
            and a["operator_id"] not in (include_recipients or set())
        ):
            continue
        by_owner.setdefault(a["operator_id"], []).append({**r, "asset": a})
    notices = []
    for owner_id, rows in by_owner.items():
        rows.sort(key=lambda r: -r["damage_fraction"])
        worst = rows[0]["risk"]
        loss = sum(r["expected_loss_meur"] for r in rows)
        bullet = "\n".join(
            f"- {r['asset']['name']}: {r['risk'].upper()} — {r['damage_fraction'] * 100:.2f}% expected damage "
            f"({_fmt_meur(r['expected_loss_meur'])}), {r['distance_m'] / 1000:.2f} km from touchdown"
            for r in rows
        )
        site = plan["site"]
        body = (
            f"To: {ops[owner_id]['name']}\nFrom: {sender['name']}\n\n"
            f"Under the harmful-interference consultation principle (Artemis Accords, Section 11), "
            f"{sender['name']} notifies you of planned landing {plan['name']} "
            f"({plan['lander']['label']}, {plan['lander']['thrust_kn']:.0f} kN) at local grid "
            f"E{site['x'] / 1000:+.2f} km / N{site['y'] / 1000:+.2f} km, window {plan['window']}.\n\n"
            f"PLUME physics assessment of your assets:\n{bullet}\n\n"
            f"Recommended protective actions: stow or feather sensitive surfaces and close optical covers "
            f"for the landing window. Please acknowledge or raise an objection in PLUME."
        )
        notices.append(
            {
                "from_operator_id": plan["operator_id"],
                "to_operator_id": owner_id,
                "asset_ids": [r["asset"]["id"] for r in rows],
                "max_risk": worst,
                "expected_loss_meur": loss,
                "subject": f"Landing consultation — {plan['name']} — {worst.upper()} risk to your assets",
                "body": body,
            }
        )
    return notices
