"""Footprint maps and landing-site optimisation."""
from __future__ import annotations

import time

import numpy as np

from .damage import ASSET_TYPES, assess_assets, damage_fraction
from .physics import Lander, exposure
from .terrain import HALF

REFERENCE_TYPE = ASSET_TYPES["solar_array"]
CHUNK = 1_500


def _exposure_pairs(terrain, lander, x0, y0, x1, y1, height):
    """Physics for many (launch, target) pairs, chunked to bound memory."""
    x0, y0, x1, y1 = np.broadcast_arrays(*(np.atleast_1d(np.asarray(a, dtype=float)) for a in (x0, y0, x1, y1)))
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
    flu = exposure(lander, xs, np.zeros_like(xs), np.zeros_like(d), d, REFERENCE_TYPE.default_height_m)
    dmg = damage_fraction(REFERENCE_TYPE, flu)["total"]
    hit = d[dmg >= 0.002]
    reach = hit.max() if len(hit) else 500.0
    return float(np.clip(reach * 1.2, 800, 14_000))


def footprint(terrain, lander: Lander, site_x: float, site_y: float, n: int = 96) -> dict:
    """Damage a reference solar array would take at each point around the site."""
    t0 = time.perf_counter()
    r = footprint_radius(lander)
    g = np.linspace(-r, r, n)
    gx, gy = np.meshgrid(site_x + g, site_y + g)  # row 0 = south
    flu = _exposure_pairs(terrain, lander, site_x, site_y, gx.ravel(), gy.ravel(), REFERENCE_TYPE.default_height_m)
    dmg = damage_fraction(REFERENCE_TYPE, flu)["total"].reshape(n, n)
    return {
        "n": n,
        "radius_m": r,
        "x_min": site_x - r, "x_max": site_x + r, "y_min": site_y - r, "y_max": site_y + r,
        "values": np.round(dmg, 5).ravel().tolist(),  # row-major, south to north
        "reference": REFERENCE_TYPE.label,
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


def assess(terrain, lander: Lander, dispersion_m: float, site_x: float, site_y: float, assets: list[dict]) -> dict:
    t0 = time.perf_counter()
    results = assess_assets(terrain, lander, dispersion_m, site_x, site_y, assets)
    return {
        "site": {"x": site_x, "y": site_y, "elevation_m": float(terrain.elevation(site_x, site_y)),
                 "slope_deg": float(terrain.slope_deg(site_x, site_y))},
        "assets": results,
        "summary": _summary(results),
        "compute_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


def optimize(terrain, lander: Lander, dispersion_m: float, target_x: float, target_y: float,
             assets: list[dict], search_radius_m: float = 3_000, traverse_meur_per_km: float = 2.0,
             max_slope_deg: float = 8.0, clearance_m: float = 300.0) -> dict:
    t0 = time.perf_counter()
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
        near |= np.hypot(cx - a["x"], cy - a["y"]) < clearance_m
    feasible = (slope <= max_slope_deg) & ~near

    # Stage 1: screen every candidate at its nominal touchdown point.
    loss = np.zeros_like(cx)
    for a in assets:
        atype = ASSET_TYPES[a["type"]]
        flu = _exposure_pairs(terrain, lander, cx, cy, a["x"], a["y"], a.get("height_m") or atype.default_height_m)
        loss += damage_fraction(atype, flu)["total"] * a["value_meur"]
    traverse = np.hypot(cx - target_x, cy - target_y) / 1000 * traverse_meur_per_km
    cost = np.where(feasible, loss + traverse, np.inf)

    # Stage 2: re-score the best few including landing dispersion.
    order = np.argsort(cost)[:8]
    shortlist = []
    for i in order:
        if not np.isfinite(cost[i]):
            break
        res = assess_assets(terrain, lander, dispersion_m, cx[i], cy[i], assets)
        s = _summary(res)
        shortlist.append({
            "x": float(cx[i]), "y": float(cy[i]),
            "expected_loss_meur": s["expected_loss_meur"],
            "worst_risk": s["worst_risk"],
            "worst_damage_fraction": max((r["damage_fraction"] for r in res), default=0.0),
            "assets_at_risk": s["assets_at_risk"],
            "nearest_asset_m": min((r["distance_m"] for r in res), default=None),
            "traverse_meur": float(traverse[i]),
            "total_cost_meur": s["expected_loss_meur"] + float(traverse[i]),
            "distance_from_target_m": float(np.hypot(cx[i] - target_x, cy[i] - target_y)),
            "slope_deg": float(slope[i]),
        })
    shortlist.sort(key=lambda c: c["total_cost_meur"])
    baseline = assess(terrain, lander, dispersion_m, target_x, target_y, assets)
    best = assess(terrain, lander, dispersion_m, shortlist[0]["x"], shortlist[0]["y"], assets) if shortlist else None

    return {
        "target": baseline,
        "best": best,
        "best_traverse_meur": shortlist[0]["traverse_meur"] if shortlist else None,
        "alternatives": shortlist[1:5],
        "search": {
            "candidates": int(len(cx)),
            "feasible": int(feasible.sum()),
            "radius_m": search_radius_m,
            "step_m": step,
            "points": [
                [round(float(x)), round(float(y)), None if not np.isfinite(c) else round(float(c), 3)]
                for x, y, c in zip(cx, cy, cost)
            ],
        },
        "compute_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
