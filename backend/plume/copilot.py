"""Language layer: briefings for the landing operator and formal notices for
neighbours.

Safety numbers always come from the physics engine. The language model
(Claude or OpenAI) only explains them and proposes mitigations; it never
computes or changes a risk figure. If no provider is configured or the API is
unreachable, a deterministic template is used instead, and the response says
which path produced the text.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time

from .damage import ASSET_TYPES

MODEL = os.getenv("PLUME_LLM_MODEL", "claude-opus-5-5")
OPENAI_MODEL = os.getenv("PLUME_OPENAI_MODEL", "gpt-4o-mini")


def provider() -> str | None:
    """Explicit PLUME_LLM_PROVIDER wins; otherwise use whichever key is set."""
    chosen = os.getenv("PLUME_LLM_PROVIDER", "").strip().lower()
    if chosen in ("anthropic", "openai"):
        key = "ANTHROPIC_API_KEY" if chosen == "anthropic" else "OPENAI_API_KEY"
        return chosen if os.getenv(key) else None
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return None


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


def _narrate(system: str, messages: list[dict], json_mode: bool) -> tuple[str, str, str]:
    """One model call. Returns (text, source, model); raises if unavailable."""
    which = provider()
    if which == "anthropic":
        import anthropic

        client = anthropic.Anthropic(timeout=12.0, max_retries=0)
        try:
            response = client.messages.create(
                model=MODEL, max_tokens=900, system=system, messages=messages
            )
        finally:
            client.close()
        if response.stop_reason == "refusal":
            raise RuntimeError("model declined")
        text = "".join(b.text for b in response.content if b.type == "text")
        return text.strip(), "claude", response.model
    if which == "openai":
        from openai import OpenAI

        client = OpenAI(timeout=12.0, max_retries=0)
        try:
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                max_completion_tokens=900,
                messages=[{"role": "system", "content": system}, *messages],
                **({"response_format": {"type": "json_object"}} if json_mode else {}),
            )
        finally:
            client.close()
        return (response.choices[0].message.content or "").strip(), "openai", response.model
    raise RuntimeError("LLM not configured")


_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
log = logging.getLogger("plume.copilot")
ATTEMPTS = 2  # one corrective retry when the guard rejects an answer


class GuardRejected(ValueError):
    """The model answered, but the answer broke a grounding rule."""


def _unsupported_numbers(texts: list[str], *sources: object) -> set[str]:
    """Literal numbers in the output that do not appear in the inputs.

    Conservative token check, not a semantic truth validator. Numbered-list
    markers ("1. ") are formatting, not figures.
    """
    allowed = set(_NUMBER.findall(" ".join(json.dumps(s, ensure_ascii=False) for s in sources)))
    found: set[str] = set()
    for t in texts:
        found |= set(_NUMBER.findall(re.sub(r"(?m)^\s*\d+\.\s", "", t)))
    return found - allowed


def _numbers_grounded(texts: list[str], *sources: object) -> bool:
    return not _unsupported_numbers(texts, *sources)


def _guarded(system: str, messages: list[dict], check) -> tuple[object, str, str, int]:
    """Call the model; if `check` rejects the answer, say why and retry once.

    `check(text)` returns the accepted result or raises GuardRejected. Returns
    (result, source, model, attempts).
    """
    messages = list(messages)
    for attempt in range(1, ATTEMPTS + 1):
        text, source, model = _narrate(system, messages, json_mode=True)
        try:
            return check(text), source, model, attempt
        except GuardRejected as rejected:
            if attempt == ATTEMPTS:
                raise
            log.info("copilot answer rejected (%s); retrying", rejected)
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"Your answer was rejected: {rejected}. Rewrite it following "
                                            "the rules, using only names and numbers that appear in the "
                                            "data, quoted exactly. Answer with the JSON object only."},
            ]
    raise RuntimeError("unreachable")


def _fallback_reason(exc: Exception) -> str:
    if isinstance(exc, GuardRejected):
        return f"answer rejected by the grounding check ({exc})"
    if str(exc) == "LLM not configured":
        return "no language model configured"
    return f"language model unavailable ({type(exc).__name__})"


def _parse_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


# ---------- briefing ---------------------------------------------------------

SYSTEM = """You are PLUME's coordination copilot for lunar landing operations.
You receive a landing plan and a physics-based ejecta risk assessment computed by
PLUME's engine. Write a concise briefing for the landing operator's flight
director.

Rules:
- Use ONLY the numbers given in the assessment. Never invent or recompute figures.
- Quote numbers exactly as given (same rounding); do not derive new figures,
  totals, percentages or counts.
- expected_damage_pct is the expected share of the asset's value lost, averaged
  over touchdown dispersion. It is never a probability or "chance".
- Say plainly which neighbouring assets are at risk and why (distance, line of
  sight, terrain shielding, damage mechanism: erosion, impact or dust coating).
- Propose concrete mitigations drawn from: moving the touchdown point, terrain
  shielding behind ridges/crater rims, shorter low-altitude hover, scheduling
  while neighbours stow sensitive surfaces (arrays feathered edge-on, telescope
  covers closed), and prior consultation under the Artemis Accords "harmful
  interference" principle.
- State the main model limitation in one sentence.

Answer with a single JSON object and nothing else:
{"situation": "2-3 sentences",
 "risks": [{"asset": "exact asset name from the input", "risk": "the asset's risk level from the input", "why": "one sentence"}],
 "actions": ["3 to 5 short imperative sentences"],
 "limitations": "one sentence"}
List in "risks" only assets whose risk is elevated or critical; use an empty list if there are none."""

# One worked example on a deliberately different, fictional scenario: it fixes
# tone and structure. Its names and numbers are not in any real input, so the
# numeric guard rejects an answer that copies them.
BRIEF_EXAMPLE_IN = {
    "example_only": "Different scenario. Do not reuse its names or numbers.",
    "lander": {"label": "Medium cargo lander", "thrust_kn": 90, "hover_s": 35, "dispersion_m": 80},
    "site": {"x_m": -4200, "y_m": 2600, "elevation_m": 312, "slope_deg": 3.1},
    "total_expected_loss": "€6.30M",
    "assets": [
        {"asset": "Ridge Array 9", "owner": "Example Power", "type": "Solar array", "distance_km": 0.94,
         "risk": "elevated", "expected_damage_pct": 7.42, "expected_loss": "€5.94M",
         "dominant_mechanism": "coating", "terrain_shielded": False},
        {"asset": "Basin Habitat 2", "owner": "Example Habitats", "type": "Habitat", "distance_km": 2.61,
         "risk": "negligible", "expected_damage_pct": 0.03, "expected_loss": "€0.36M",
         "dominant_mechanism": "erosion", "terrain_shielded": True},
    ],
}
BRIEF_EXAMPLE_OUT = {
    "situation": "Medium cargo lander at the requested site puts €6.30M of neighbouring infrastructure at risk. "
                 "Almost all of it is Ridge Array 9, which has a direct line of sight to the touchdown point.",
    "risks": [
        {"asset": "Ridge Array 9", "risk": "elevated",
         "why": "At 0.94 km with no terrain in between, fine dust would coat its panels (7.42% expected damage)."},
    ],
    "actions": [
        "Compare alternative touchdown points that put the ridge between the plume and the array.",
        "Ask Example Power to feather the array edge-on for the landing window.",
        "Shorten the low-altitude hover to reduce eroded mass.",
        "File a consultation notice with Example Power before the window.",
    ],
    "limitations": "Simplified ballistic model on synthetic terrain; not a flight certification.",
}


def _payload(lander, assessment, digest, optimized_digest=None, optimized=None):
    site = assessment["site"]
    payload = {
        "lander": lander,
        # Rounded so the model quotes the same literal values it was given.
        "site": {
            "x_m": round(site["x"]),
            "y_m": round(site["y"]),
            "elevation_m": round(site.get("elevation_m", 0)),
            "slope_deg": round(site.get("slope_deg", 0), 1),
        },
        "total_expected_loss": _fmt_meur(assessment["summary"]["expected_loss_meur"]),
        "assets": digest,
    }
    if optimized:
        before = assessment["summary"]["expected_loss_meur"]
        after = optimized["summary"]["expected_loss_meur"]
        payload["optimised_alternative"] = {
            "site": {"x_m": round(optimized["site"]["x"]), "y_m": round(optimized["site"]["y"])},
            "total_expected_loss": _fmt_meur(after),
            # Pre-computed here so the model never has to do arithmetic.
            "expected_loss_reduction": _fmt_meur(max(before - after, 0.0)),
            "expected_loss_reduction_pct": round(100 * (1 - after / before)) if before > 0 else 0,
            "relocation_km": round(
                ((optimized["site"]["x"] - assessment["site"]["x"]) ** 2
                 + (optimized["site"]["y"] - assessment["site"]["y"]) ** 2) ** 0.5 / 1000, 2),
            "assets": optimized_digest,
        }
    return payload


def _valid_brief(data: dict, digest: list[dict]) -> dict | None:
    """Schema and grounding checks: real asset names, risk levels match physics."""
    risk_of = {d["asset"]: d["risk"] for d in digest}
    try:
        situation = str(data["situation"]).strip()
        limitations = str(data.get("limitations", "")).strip()
        risks = [
            {"asset": str(r["asset"]).strip(), "risk": str(r["risk"]).strip().lower(), "why": str(r["why"]).strip()}
            for r in data["risks"]
        ]
        actions = [str(a).strip() for a in data["actions"] if str(a).strip()]
    except (KeyError, TypeError):
        return None
    if not situation or not 1 <= len(actions) <= 6 or len(risks) > len(digest):
        return None
    if any(r["asset"] not in risk_of or risk_of[r["asset"]] != r["risk"] for r in risks):
        return None
    return {"situation": situation, "risks": risks, "actions": actions, "limitations": limitations}


def _brief_markdown(b: dict) -> str:
    lines = ["### Situation", b["situation"], "", "### Risk drivers"]
    lines += [f"- **{r['asset']}** ({r['risk']}): {r['why']}" for r in b["risks"]] or ["- No asset at elevated or critical risk."]
    lines += ["", "### Recommended actions", *[f"- {a}" for a in b["actions"]]]
    if b.get("limitations"):
        lines += ["", f"*{b['limitations']}*"]
    return "\n".join(lines)


def _template_structured(lander, assessment, digest, optimized) -> dict:
    s = assessment["summary"]
    risks = [
        {"asset": d["asset"], "risk": d["risk"],
         "why": f"{d['expected_damage_pct']}% expected damage ({d['expected_loss']}), mainly "
                f"{d['dominant_mechanism']} at {d['distance_km']} km"
                + (" despite terrain shielding." if d["terrain_shielded"] else ".")}
        for d in digest if d["risk"] in ("elevated", "critical")
    ]
    actions = []
    if optimized:
        actions.append(f"Move touchdown to the optimised site: expected loss drops to "
                       f"{_fmt_meur(optimized['summary']['expected_loss_meur'])}.")
    actions += [
        "Ask affected operators to stow sensitive surfaces during the landing window.",
        "Minimise low-altitude hover time.",
        "Send a formal consultation notice before the window.",
    ]
    return {
        "situation": f"{lander['label']} ({lander['thrust_kn']:.0f} kN, {lander['hover_s']:.0f} s low hover) at the "
                     f"requested site exposes neighbours to an expected loss of {_fmt_meur(s['expected_loss_meur'])}.",
        "risks": risks,
        "actions": actions,
        "limitations": "Simplified ballistic model on synthetic terrain; not a flight certification.",
    }


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
    opt_digest = _assessment_digest(assets_by_id, ops, optimized) if optimized else None
    payload = _payload(lander, assessment, digest, opt_digest, optimized)
    t0 = time.perf_counter()

    def check(text: str):
        if not text:
            raise GuardRejected("empty answer")
        data = _parse_json(text)
        structured = _valid_brief(data, digest) if data is not None else None
        if data is not None and structured is None:
            raise GuardRejected("asset names or risk levels do not match the assessment, or fields are missing")
        checked = (
            [structured["situation"], structured["limitations"], *structured["actions"], *(r["why"] for r in structured["risks"])]
            if structured
            else [text]
        )
        bad = _unsupported_numbers(checked, payload)
        if bad:
            raise GuardRejected("numbers not in the data: " + ", ".join(sorted(bad)))
        return structured, text

    try:
        (structured, text), source, model, attempts = _guarded(
            SYSTEM,
            [
                {"role": "user", "content": json.dumps(BRIEF_EXAMPLE_IN, ensure_ascii=False)},
                {"role": "assistant", "content": json.dumps(BRIEF_EXAMPLE_OUT, ensure_ascii=False)},
                {"role": "user", "content": "Landing plan and assessment:\n" + json.dumps(payload, indent=1, ensure_ascii=False)},
            ],
            check,
        )
        return {
            "markdown": _brief_markdown(structured) if structured else text,
            "structured": structured,
            "source": source,
            "model": model,
            "attempts": attempts,
            "numeric_validation": "literal tokens checked against input; semantics not certified",
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        }
    except Exception as exc:  # offline / no credentials / API error / failed guard: never break the demo
        reason = _fallback_reason(exc)
        log.warning("copilot brief fell back to template: %s", reason)
        return {
            "markdown": _template_brief(lander, assessment, digest, optimized),
            "structured": _template_structured(lander, assessment, digest, optimized),
            "source": "template",
            "reason": reason,
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        }


# ---------- grounded questions ----------------------------------------------

ASK_SYSTEM = """You are PLUME's coordination copilot. Answer the flight director's
question about ONE landing assessment computed by PLUME's physics engine.

Rules:
- Answer only from the data provided. If the data cannot answer the question,
  say so plainly and suggest which PLUME step would (compare sites, inspect an
  asset, consult the neighbour). Do not answer unrelated questions.
- Use ONLY numbers present in the data, quoted exactly; never compute new ones.
  Savings and relocation distance are provided under optimised_alternative.
  Write plain sentences: no quotation marks around numbers.
- Percentages of damage are expected value lost, never a probability or chance.
  Do not claim an asset is shielded unless terrain_shielded is true for it.
- Explain mechanisms in plain language: erosion = sandblasting, impact = gravel
  and rocks, coating = fine dust on optics and solar cells. Mention distance,
  line of sight and terrain shielding when relevant.
- Changes you may suggest: move the touchdown point (cite the optimised
  alternative if present), use terrain shielding, shorten the low-altitude
  hover, schedule while neighbours stow sensitive surfaces, consult first.

Answer with a single JSON object and nothing else:
{"answer": "2-4 sentences", "points": ["0 to 4 short supporting points"]}"""

ASK_EXAMPLE_IN = {
    "example_only": "Different scenario. Do not reuse its names or numbers.",
    "question": "Why is Ridge Array 9 affected?",
    "focus_asset": {"asset": "Ridge Array 9", "type": "Solar array", "distance_km": 0.94, "risk": "elevated",
                    "expected_damage_pct": 7.42, "terrain_shielded": False,
                    "mechanism_pct": {"erosion": 0.81, "impact": 0.02, "coating": 6.65}},
}
ASK_EXAMPLE_OUT = {
    "answer": "Ridge Array 9 sits 0.94 km from touchdown with nothing between it and the plume, so fine "
              "dust thrown out at shallow angles lands on its panels. Coating dominates: 6.65% of its "
              "expected 7.42% damage.",
    "points": ["No terrain shielding along the line of sight.",
               "Solar cells are especially sensitive to dust coating.",
               "Compare sites behind a ridge to cut the exposure."],
}


def _focus(assessment, asset, operators) -> dict:
    r = next(x for x in assessment["assets"] if x["asset_id"] == asset["id"])
    u = r.get("uncertainty") or {}
    return {
        "asset": asset["name"],
        "owner": next((o["name"] for o in operators if o["id"] == asset["operator_id"]), asset["operator_id"]),
        "type": ASSET_TYPES[asset["type"]].label,
        "distance_km": round(r["distance_m"] / 1000, 2),
        "risk": r["risk"],
        "expected_damage_pct": round(r["damage_fraction"] * 100, 2),
        "expected_loss": _fmt_meur(r["expected_loss_meur"]),
        "terrain_shielded": r["shielded"],
        "mechanism_pct": {k: round(v * 100, 2) for k, v in r["mechanisms"].items()},
        "worst_sample_damage_pct": round(u.get("worst_sample_damage", r["damage_fraction"]) * 100, 2),
    }


def _template_answer(kind, question, focus, payload) -> dict:
    if kind == "why" and focus:
        mech = max(focus["mechanism_pct"], key=focus["mechanism_pct"].get)
        plain = {"erosion": "sandblasting", "impact": "gravel and rock impacts", "coating": "fine dust coating"}[mech]
        return {
            "answer": f"{focus['asset']} is {focus['distance_km']} km from touchdown and its modeled damage is "
                      f"{focus['expected_damage_pct']}% ({focus['risk']}). The largest contribution is {plain}.",
            "points": [
                "Terrain shields it at the nominal touchdown point." if focus["terrain_shielded"]
                else "No terrain blocks the line of sight to the plume.",
                f"Mechanisms: erosion {focus['mechanism_pct']['erosion']}%, impact {focus['mechanism_pct']['impact']}%, "
                f"coating {focus['mechanism_pct']['coating']}%.",
            ],
        }
    if kind == "change":
        alt = payload.get("optimised_alternative")
        points = ["Shorten the low-altitude hover to erode less regolith.",
                  "Ask neighbours to stow sensitive surfaces during the window.",
                  "File a consultation notice before the window."]
        if alt:
            return {"answer": f"Moving to the optimised site lowers the expected loss from "
                              f"{payload['total_expected_loss']} to {alt['total_expected_loss']}.", "points": points}
        return {"answer": "Compare alternative landing sites to find one with less exposure; the "
                          "optimizer has not been run for this draft yet.", "points": points}
    return {"answer": "The language model is unavailable, so only predefined explanations are offered. "
                      f"The current modeled loss to neighbours is {payload['total_expected_loss']}.",
            "points": ["Use “Why is this asset affected?” or “What can I change?”."]}


def ask(
    lander: dict,
    assessment: dict,
    assets: list[dict],
    operators: list[dict],
    question: str,
    kind: str = "free",
    asset_id: str | None = None,
    optimized: dict | None = None,
) -> dict:
    assets_by_id = {a["id"]: a for a in assets}
    ops = {o["id"]: o for o in operators}
    digest = _assessment_digest(assets_by_id, ops, assessment)
    opt_digest = _assessment_digest(assets_by_id, ops, optimized) if optimized else None
    payload = _payload(lander, assessment, digest, opt_digest, optimized)
    asset = assets_by_id.get(asset_id) if asset_id else None
    focus = _focus(assessment, asset, operators) if asset else None
    request = {"question": question, **({"focus_asset": focus} if focus else {}), "assessment": payload}
    t0 = time.perf_counter()

    def check(text: str):
        data = _parse_json(text) or {}
        answer = str(data.get("answer", "")).strip()
        points = [str(p).strip() for p in data.get("points", []) if str(p).strip()][:4]
        if not answer:
            raise GuardRejected("no answer field")
        bad = _unsupported_numbers([answer, *points], request)
        if bad:
            raise GuardRejected("numbers not in the data: " + ", ".join(sorted(bad)))
        return answer, points

    try:
        (answer, points), source, model, attempts = _guarded(
            ASK_SYSTEM,
            [
                {"role": "user", "content": json.dumps(ASK_EXAMPLE_IN, ensure_ascii=False)},
                {"role": "assistant", "content": json.dumps(ASK_EXAMPLE_OUT, ensure_ascii=False)},
                {"role": "user", "content": json.dumps(request, indent=1, ensure_ascii=False)},
            ],
            check,
        )
        return {"answer": answer, "points": points, "source": source, "model": model, "attempts": attempts,
                "latency_ms": round((time.perf_counter() - t0) * 1000)}
    except Exception as exc:  # offline / no credentials / API error / failed guard
        reason = _fallback_reason(exc)
        log.warning("copilot answer fell back to template: %s", reason)
        return {**_template_answer(kind, question, focus, payload), "source": "template",
                "reason": reason, "latency_ms": round((time.perf_counter() - t0) * 1000)}


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
