"""Footprint maps and landing-site optimisation."""

from __future__ import annotations

import time

import numpy as np

from .damage import ASSET_TYPES, assess_assets, damage_fraction, landing_samples
from .physics import Lander, exposure
from .terrain import HALF
from .provenance import provenance

REFERENCE_TYPE = ASSET_TYPES["solar_array"]
CHUNK = 1_500


def _exposure_pairs(terrain, lander, x0, y0, x1, y1, height):
    """Physics for many (launch, target) pairs, chunked to bound memory."""
    x0, y0, x1, y1 = np.broadcast_arrays(
        *(np.atleast_1d(np.asarray(a, dtype=float)) for a in (x0, y0, x1, y1))
    )
    parts: list[dict] = []
    for s in range(0, len(x0), CHUNK):
        sl = slice(s, s + CHUNK)
        xs, zs, za, d = terrain.profiles(x0[sl], y0[sl], x1[sl], y1[sl])
        parts.append(exposure(lander, xs, zs, za, d, height))
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}


def footprint_radius(lander: Lander) -> float:
    d = np.geomspace(100, 20_000, 60)
    k = 40
    xs = np.linspace(0.02, 0.97, k)[None, :] * d[:, None]
    flu = exposure(
        lander,
        xs,
        np.zeros_like(xs),
        np.zeros_like(d),
        d,
        REFERENCE_TYPE.default_height_m,
    )
    dmg = damage_fraction(REFERENCE_TYPE, flu)["total"]
    hit = d[dmg >= 0.002]
    reach = hit.max() if len(hit) else 500.0
    return float(np.clip(reach * 1.2, 800, 14_000))


def footprint(
    terrain, lander: Lander, site_x: float, site_y: float, n: int = 96
) -> dict:
    """Damage a reference solar array would take at each point around the site."""
    t0 = time.perf_counter()
    r = footprint_radius(lander)
    g = np.linspace(-r, r, n)
    gx, gy = np.meshgrid(site_x + g, site_y + g)  # row 0 = south
    flu = _exposure_pairs(
        terrain,
        lander,
        site_x,
        site_y,
        gx.ravel(),
        gy.ravel(),
        REFERENCE_TYPE.default_height_m,
    )
    dmg = damage_fraction(REFERENCE_TYPE, flu)["total"].reshape(n, n)
    valid = (np.abs(gx) <= HALF) & (np.abs(gy) <= HALF)
    dmg = np.where(valid, dmg, 0.0)
    return {
        "n": n,
        "radius_m": r,
        "x_min": site_x - r,
        "x_max": site_x + r,
        "y_min": site_y - r,
        "y_max": site_y + r,
        "values": np.round(dmg, 5).ravel().tolist(),  # row-major, south to north
        "reference": REFERENCE_TYPE.label,
        "metadata": {
            **provenance(terrain),
            "reference_asset_type": REFERENCE_TYPE.key,
            "dispersion_mode": "nominal touchdown only",
            "dispersion_included": False,
            "parameters": {
                "thrust_kn": lander.thrust_kn,
                "hover_s": lander.hover_s,
                "n": n,
            },
            "invalid_pixel_policy": "values=0 placeholder; valid_mask=false means unknown, not safe",
        },
        "valid_mask": valid.ravel().tolist(),
        "compute_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


def _summary(results: list[dict]) -> dict:
    loss = sum(r["expected_loss_meur"] for r in results)
    worst = max(results, key=lambda r: r["damage_fraction"], default=None)
    return {
        "expected_loss_meur": loss,
        "worst_asset_id": worst["asset_id"] if worst else None,
        "worst_risk": worst["risk"] if worst else "negligible",
        "assets_at_risk": sum(r["risk"] in ("elevated", "critical") for r in results),
    }


def assess(
    terrain,
    lander: Lander,
    dispersion_m: float,
    site_x: float,
    site_y: float,
    assets: list[dict],
) -> dict:
    t0 = time.perf_counter()
    results = assess_assets(terrain, lander, dispersion_m, site_x, site_y, assets)
    return {
        "site": {
            "x": site_x,
            "y": site_y,
            "elevation_m": float(terrain.elevation(site_x, site_y)),
            "slope_deg": float(terrain.slope_deg(site_x, site_y)),
        },
        "assets": results,
        "provenance": provenance(terrain),
        "uncertainty": landing_samples(site_x, site_y, dispersion_m)[2],
        "summary": _summary(results),
        "compute_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


def optimize(
    terrain,
    lander: Lander,
    dispersion_m: float,
    target_x: float,
    target_y: float,
    assets: list[dict],
    search_radius_m: float = 3_000,
    traverse_meur_per_km: float = 2.0,
    max_slope_deg: float = 8.0,
    clearance_m: float = 300.0,
    strategy: str = "improved",
    dispersion_margin_sigma: float = 0.0,
) -> dict:
    t0 = time.perf_counter()
    if strategy not in ("baseline", "improved"):
        raise ValueError("Unknown optimizer strategy")
    effective_clearance = clearance_m + dispersion_margin_sigma * dispersion_m
    step = search_radius_m / 24
    g = np.arange(-search_radius_m, search_radius_m + 1e-6, step)
    cx, cy = np.meshgrid(target_x + g, target_y + g)
    cx, cy = cx.ravel(), cy.ravel()
    inside = np.hypot(cx - target_x, cy - target_y) <= search_radius_m
    inside &= (np.abs(cx) < HALF - 500) & (np.abs(cy) < HALF - 500)
    cx, cy = cx[inside], cy[inside]

    slope = terrain.slope_deg(cx, cy)
    near = np.zeros_like(cx, dtype=bool)
    for a in assets:
        near |= np.hypot(cx - a["x"], cy - a["y"]) < effective_clearance
    feasible = (slope <= max_slope_deg) & ~near

    # Stage 1: screen every candidate at its nominal touchdown point.
    loss = np.zeros_like(cx)
    for a in assets:
        atype = ASSET_TYPES[a["type"]]
        flu = _exposure_pairs(
            terrain,
            lander,
            cx,
            cy,
            a["x"],
            a["y"],
            a.get("height_m") or atype.default_height_m,
        )
        loss += damage_fraction(atype, flu)["total"] * a["value_meur"]
    traverse = np.hypot(cx - target_x, cy - target_y) / 1000 * traverse_meur_per_km
    cost = np.where(feasible, loss + traverse, np.inf)

    # Stage 2: re-score the best few including landing dispersion.
    order = np.argsort(cost)[: (8 if strategy == "baseline" else 32)]
    shortlist = []
    for i in order:
        if not np.isfinite(cost[i]):
            break
        res = assess_assets(terrain, lander, dispersion_m, cx[i], cy[i], assets)
        s = _summary(res)
        shortlist.append(
            {
                "x": float(cx[i]),
                "y": float(cy[i]),
                "expected_loss_meur": s["expected_loss_meur"],
                "traverse_meur": float(traverse[i]),
                "total_cost_meur": s["expected_loss_meur"] + float(traverse[i]),
                "distance_from_target_m": float(
                    np.hypot(cx[i] - target_x, cy[i] - target_y)
                ),
                "slope_deg": float(slope[i]),
                "nearest_asset_m": min(
                    (float(np.hypot(cx[i] - a["x"], cy[i] - a["y"])) for a in assets),
                    default=None,
                ),
                "worst_risk": s["worst_risk"],
                "worst_damage_fraction": max(
                    (r["damage_fraction"] for r in res), default=0.0
                ),
                "assets_at_risk": s["assets_at_risk"],
                "explanation": {
                    "selected_by": "lowest evaluated dispersion-aware damage plus relocation cost",
                    "constraints": {
                        "slope_pass": True,
                        "clearance_pass": True,
                        "effective_clearance_m": effective_clearance,
                        "dispersion_margin_sigma": dispersion_margin_sigma,
                        "slope_evaluated_at": "nominal touchdown",
                    },
                    "not_global_optimum": True,
                },
            }
        )
    shortlist.sort(key=lambda c: c["total_cost_meur"])
    refined_count = 0
    if strategy == "improved":
        anchors = shortlist[:3]
        for anchor in anchors:
            for dx, dy in (
                (-1, -1),
                (-1, 0),
                (-1, 1),
                (0, -1),
                (0, 1),
                (1, -1),
                (1, 0),
                (1, 1),
            ):
                x, y = anchor["x"] + dx * step / 3, anchor["y"] + dy * step / 3
                moved = float(np.hypot(x - target_x, y - target_y))
                nearest = min(
                    (float(np.hypot(x - a["x"], y - a["y"])) for a in assets),
                    default=float("inf"),
                )
                sl = float(terrain.slope_deg(x, y))
                if (
                    moved > search_radius_m
                    or abs(x) >= HALF - 500
                    or abs(y) >= HALF - 500
                    or sl > max_slope_deg
                    or nearest < effective_clearance
                ):
                    continue
                res = assess_assets(terrain, lander, dispersion_m, x, y, assets)
                summary = _summary(res)
                travel = moved / 1000 * traverse_meur_per_km
                shortlist.append(
                    {
                        "x": float(x),
                        "y": float(y),
                        "expected_loss_meur": summary["expected_loss_meur"],
                        "traverse_meur": travel,
                        "total_cost_meur": summary["expected_loss_meur"] + travel,
                        "distance_from_target_m": moved,
                        "slope_deg": sl,
                        "nearest_asset_m": nearest if np.isfinite(nearest) else None,
                        "worst_risk": summary["worst_risk"],
                        "worst_damage_fraction": max(
                            (r["damage_fraction"] for r in res), default=0.0
                        ),
                        "assets_at_risk": summary["assets_at_risk"],
                        "explanation": {
                            **anchor["explanation"],
                            "local_refinement_step_m": step / 3,
                        },
                    }
                )
                refined_count += 1
        shortlist.sort(key=lambda c: c["total_cost_meur"])
    baseline = assess(terrain, lander, dispersion_m, target_x, target_y, assets)
    best = (
        assess(
            terrain, lander, dispersion_m, shortlist[0]["x"], shortlist[0]["y"], assets
        )
        if shortlist
        else None
    )

    diverse = []
    separation = max(250.0, step)
    anchors = shortlist[:1]
    for candidate in shortlist[1:]:
        if all(
            np.hypot(candidate["x"] - a["x"], candidate["y"] - a["y"]) >= separation
            for a in anchors
        ):
            diverse.append(candidate)
            anchors.append(candidate)
        if len(diverse) == 4:
            break
    pareto = [
        c
        for c in shortlist
        if not any(
            all(
                o[k] <= c[k]
                for k in ("expected_loss_meur", "distance_from_target_m", "slope_deg")
            )
            and any(
                o[k] < c[k]
                for k in ("expected_loss_meur", "distance_from_target_m", "slope_deg")
            )
            for o in shortlist
        )
    ]
    return {
        "target": baseline,
        "best": best,
        "best_traverse_meur": shortlist[0]["traverse_meur"] if shortlist else None,
        "alternatives": shortlist[1:5] if strategy == "baseline" else diverse,
        "best_explanation": shortlist[0] if shortlist else None,
        "pareto_evaluated_shortlist": pareto,
        "method": {
            "strategy": strategy,
            "rescored": len(shortlist),
            "refined_count": refined_count,
            "global_optimum_proven": False,
            "alternative_minimum_separation_m": separation,
            "baseline_top8_included": True,
        },
        "search": {
            "candidates": int(len(cx)),
            "rejection_counts": {
                "slope": int((slope > max_slope_deg).sum()),
                "clearance": int(near.sum()),
                "combined_infeasible": int((~feasible).sum()),
            },
            "rejections": [
                {
                    "x": float(cx[i]),
                    "y": float(cy[i]),
                    "violations": (["slope"] if slope[i] > max_slope_deg else [])
                    + (["clearance"] if near[i] else []),
                }
                for i in np.flatnonzero(~feasible)
            ],
            "feasible": int(feasible.sum()),
            "radius_m": search_radius_m,
            "step_m": step,
            "points": [
                [
                    round(float(x)),
                    round(float(y)),
                    None if not np.isfinite(c) else round(float(c), 3),
                ]
                for x, y, c in zip(cx, cy, cost)
            ],
        },
        "compute_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
