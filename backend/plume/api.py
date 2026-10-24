"""PLUME HTTP API."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import copilot, planner
from .damage import ASSET_TYPES, RISK_BANDS
from .physics import SIZE_CLASSES, Lander, max_range_m
from .store import LANDER_PRESETS, Store
from .terrain import HALF, RES_M, SIZE_M, Terrain

app = FastAPI(title="PLUME", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

terrain = Terrain()
store = Store()
_hillshade = terrain.hillshade_png()


class LanderIn(BaseModel):
    label: str = "Custom lander"
    thrust_kn: float = Field(gt=0.5, le=5_000)
    hover_s: float = Field(gt=1, le=300)
    dispersion_m: float = Field(ge=0, le=2_000)

    def physics(self) -> Lander:
        return Lander(self.thrust_kn, self.hover_s)


class Point(BaseModel):
    x: float = Field(ge=-HALF, le=HALF)
    y: float = Field(ge=-HALF, le=HALF)


class SiteRequest(BaseModel):
    lander: LanderIn
    site: Point


class OptimizeRequest(SiteRequest):
    search_radius_m: float = Field(3_000, ge=500, le=8_000)
    traverse_meur_per_km: float = Field(2.0, ge=0, le=50)
    max_slope_deg: float = Field(8.0, ge=2, le=20)
    clearance_m: float = Field(300, ge=50, le=2_000)


class BriefRequest(SiteRequest):
    optimized_site: Point | None = None


class AssetIn(BaseModel):
    operator_id: str
    name: str = Field(min_length=1, max_length=80)
    type: Literal["habitat", "solar_array", "isru_plant", "comms_relay", "telescope", "rover"]
    x: float = Field(ge=-HALF, le=HALF)
    y: float = Field(ge=-HALF, le=HALF)
    value_meur: float = Field(gt=0, le=10_000)


class PlanIn(SiteRequest):
    operator_id: str
    name: str = Field(min_length=1, max_length=80)
    window: str = Field(min_length=1, max_length=80)


class NoticeUpdate(BaseModel):
    status: Literal["acknowledged", "objection"]
    reply: str | None = Field(None, max_length=1_000)


# --- reference data --------------------------------------------------------
@app.get("/api/meta")
def meta():
    return {
        "terrain": {"size_m": SIZE_M, "res_m": RES_M, "x_min": -HALF, "x_max": HALF, "y_min": -HALF, "y_max": HALF,
                    "label": "Synthetic south-pole terrain (demo data)"},
        "landers": [{**p, "max_range_m": max_range_m(Lander(p["thrust_kn"], p["hover_s"]))} for p in LANDER_PRESETS],
        "asset_types": [{"key": t.key, "label": t.label, "default_height_m": t.default_height_m,
                         "erosion_50": t.erosion_50, "impact_50": t.impact_50, "coating_50": t.coating_50}
                        for t in ASSET_TYPES.values()],
        "risk_bands": [{"below": b, "name": n} for b, n in RISK_BANDS],
        "size_classes": [c.__dict__ for c in SIZE_CLASSES],
    }


@app.get("/api/terrain/hillshade.png")
def hillshade():
    return Response(_hillshade, media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@app.get("/api/terrain/point")
def terrain_point(x: float, y: float):
    return {"x": x, "y": y, "elevation_m": float(terrain.elevation(x, y)), "slope_deg": float(terrain.slope_deg(x, y))}


# --- registry --------------------------------------------------------------
@app.get("/api/operators")
def operators():
    return store.operators()


@app.get("/api/assets")
def assets():
    return store.assets()


@app.post("/api/assets")
def add_asset(body: AssetIn):
    if not store.operator(body.operator_id):
        raise HTTPException(404, "Unknown operator")
    return store.add_asset(body.model_dump())


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str):
    if not store.delete_asset(asset_id):
        raise HTTPException(404, "Unknown asset")
    return {"ok": True}


@app.post("/api/reset")
def reset():
    store.reset()
    return {"ok": True}


# --- analysis --------------------------------------------------------------
@app.post("/api/assess")
def assess(body: SiteRequest):
    return planner.assess(terrain, body.lander.physics(), body.lander.dispersion_m, body.site.x, body.site.y,
                          store.assets())


@app.post("/api/footprint")
def footprint(body: SiteRequest):
    return planner.footprint(terrain, body.lander.physics(), body.site.x, body.site.y)


@app.post("/api/optimize")
def optimize(body: OptimizeRequest):
    return planner.optimize(terrain, body.lander.physics(), body.lander.dispersion_m, body.site.x, body.site.y,
                            store.assets(), body.search_radius_m, body.traverse_meur_per_km, body.max_slope_deg,
                            body.clearance_m)


@app.get("/api/curves")
def curves():
    """Damage to each asset type vs distance on flat ground, per lander preset."""
    import numpy as np

    from .damage import damage_fraction
    from .physics import exposure

    d = np.geomspace(50, 20_000, 80)
    xs = np.linspace(0.02, 0.97, 40)[None, :] * d[:, None]
    out = []
    for p in LANDER_PRESETS:
        lander = Lander(p["thrust_kn"], p["hover_s"])
        series = {}
        for t in ASSET_TYPES.values():
            flu = exposure(lander, xs, np.zeros_like(xs), np.zeros_like(d), d, t.default_height_m)
            series[t.key] = np.round(damage_fraction(t, flu)["total"], 6).tolist()
        out.append({"lander": p["id"], "label": p["label"], "eroded_mass_kg": lander.eroded_mass_kg,
                    "damage": series})
    # Historical check: Apollo 12 descent vs Surveyor 3 at ~160 m.
    apollo = Lander(15, 60)
    s_xs = np.linspace(0.02, 0.97, 40)[None, :] * 160
    s_flu = exposure(apollo, s_xs, np.zeros_like(s_xs), np.zeros(1), np.array([160.0]), 1.5)
    return {"distance_m": d.round(1).tolist(), "series": out,
            "surveyor_check": {"distance_m": 160, "energy_fluence_j_m2": float(s_flu["energy_total"][0]),
                               "fine_mass_g_m2": float((s_flu["mass_dust"] + s_flu["mass_sand"])[0] * 1000)}}


@app.post("/api/copilot/brief")
def brief(body: BriefRequest):
    assets_ = store.assets()
    lander = body.lander.physics()
    base = planner.assess(terrain, lander, body.lander.dispersion_m, body.site.x, body.site.y, assets_)
    opt = None
    if body.optimized_site:
        opt = planner.assess(terrain, lander, body.lander.dispersion_m, body.optimized_site.x, body.optimized_site.y,
                             assets_)
    return copilot.brief(body.lander.model_dump(), base, assets_, store.operators(), opt)


# --- landing plans & notices -----------------------------------------------
@app.get("/api/plans")
def plans():
    return store.plans()


@app.post("/api/plans")
def submit_plan(body: PlanIn):
    if not store.operator(body.operator_id):
        raise HTTPException(404, "Unknown operator")
    assets_ = store.assets()
    result = planner.assess(terrain, body.lander.physics(), body.lander.dispersion_m, body.site.x, body.site.y, assets_)
    plan = {
        "operator_id": body.operator_id, "name": body.name, "window": body.window,
        "lander": body.lander.model_dump(), "site": body.site.model_dump(),
        "summary": result["summary"],
    }
    notices = copilot.notices_for_plan(plan, result, assets_, store.operators())
    plan["status"] = "consultation" if notices else "cleared"
    saved = store.add_plan(plan, notices)
    return {"plan": saved, "notices_sent": len(notices)}


@app.get("/api/notices")
def notices(operator_id: str | None = None):
    return store.notices(operator_id)


@app.patch("/api/notices/{notice_id}")
def update_notice(notice_id: str, body: NoticeUpdate):
    n = store.set_notice_status(notice_id, body.status, body.reply)
    if not n:
        raise HTTPException(404, "Unknown notice")
    return n


# --- built frontend (production / demo mode) -------------------------------
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="static")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
