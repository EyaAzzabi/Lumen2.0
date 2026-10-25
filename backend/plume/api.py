"""PLUME HTTP API."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, copilot, planner
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
    operator_id: str | None = None  # ignored: the signed-in user's organisation owns the asset
    name: str = Field(min_length=1, max_length=80)
    type: Literal["habitat", "solar_array", "isru_plant", "comms_relay", "telescope", "rover"]
    x: float = Field(ge=-HALF, le=HALF)
    y: float = Field(ge=-HALF, le=HALF)
    value_meur: float = Field(gt=0, le=10_000)


class PlanIn(SiteRequest):
    operator_id: str | None = None  # ignored: plans are filed by the signed-in user's organisation
    name: str = Field(min_length=1, max_length=80)
    window: str = Field(min_length=1, max_length=80)


class NoticeUpdate(BaseModel):
    status: Literal["acknowledged", "objection"]
    reply: str | None = Field(None, max_length=1_000)


class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    organization: Literal["create", "join"]
    organization_name: str | None = Field(None, max_length=80)
    invite_code: str | None = Field(None, max_length=40)


class LoginIn(BaseModel):
    email: str = Field(max_length=120)
    password: str = Field(max_length=200)


# --- authentication ----------------------------------------------------------
def _token(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def current_user(authorization: str | None = Header(None)) -> dict:
    token = _token(authorization)
    user = store.user_for_token(token) if token else None
    if not user:
        raise HTTPException(401, "Sign in required")
    return user


def _session_payload(user: dict, token: str | None = None) -> dict:
    op = next(o for o in store.state["operators"] if o["id"] == user["operator_id"])
    out = {
        "user": {k: user[k] for k in ("id", "email", "name", "operator_id", "role", "demo")},
        "organization": {k: v for k, v in op.items() if k != "invite_code" or user["role"] == "admin"},
    }
    if token:
        out["token"] = token
    return out


@app.post("/api/auth/signup")
def signup(body: SignupIn):
    email = auth.normalize_email(body.email)
    if not auth.valid_email(email):
        raise HTTPException(422, "Enter a valid email address")
    if email.endswith("@plume.demo"):
        raise HTTPException(422, "This domain is reserved for demo accounts")
    operator_id, new_org = None, None
    if body.organization == "create":
        org_name = (body.organization_name or "").strip()
        if len(org_name) < 2:
            raise HTTPException(422, "Enter your organization's name")
        if any(o["name"].lower() == org_name.lower() for o in store.state["operators"]):
            raise HTTPException(409, "This organization already exists. Ask a member for its invite code")
        short = "".join(w[0] for w in org_name.split()[:3]).upper() or org_name[:3].upper()
        new_org = {"name": org_name, "short": short}
    else:
        op = store.operator_by_invite(body.invite_code or "")
        if not op:
            raise HTTPException(404, "Invalid invite code")
        operator_id = op["id"]
    try:
        user = store.create_account(body.name.strip(), email, body.password, operator_id, new_org)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _session_payload(user, store.create_session(user["id"]))


@app.post("/api/auth/login")
def login(body: LoginIn):
    user = store.user_by_email(auth.normalize_email(body.email))
    if not user or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    return _session_payload(user, store.create_session(user["id"]))


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)):
    return _session_payload(user)


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(None)):
    token = _token(authorization)
    if token:
        store.delete_session(token)
    return {"ok": True}


@app.get("/api/auth/demo-accounts")
def demo_accounts():
    """Seeded demo logins (fictional organisations), shown on the sign-in page."""
    return [{"email": u["email"], "organization": store.operator(u["operator_id"])["name"],
             "operator_id": u["operator_id"], "password": auth.DEMO_PASSWORD}
            for u in store.state["users"] if u.get("demo")]


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


@app.get("/api/terrain/mesh")
def terrain_mesh():
    """Read-only visualization grid sampled from the actual simulation terrain.

    Rows run south to north, columns west to east. No visual-only elevation
    generation or changes to the simulation's native 50 m terrain are involved.
    """
    import numpy as np

    n = 201
    axis = np.linspace(-HALF, HALF, n)
    x, y = np.meshgrid(axis, axis)
    return {"n": n, "size_m": SIZE_M, "x_min": -HALF, "y_min": -HALF,
            "step_m": SIZE_M / (n - 1), "label": "Synthetic south-pole terrain (demo data)",
            "elevations_m": np.round(terrain.elevation(x, y), 2).ravel().tolist()}


# --- registry --------------------------------------------------------------
@app.get("/api/operators")
def operators():
    return store.operators()


@app.get("/api/assets")
def assets():
    return store.assets()


@app.post("/api/assets")
def add_asset(body: AssetIn, user: dict = Depends(current_user)):
    return store.add_asset({**body.model_dump(), "operator_id": user["operator_id"]})


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str, user: dict = Depends(current_user)):
    a = store.asset(asset_id)
    if not a:
        raise HTTPException(404, "Unknown asset")
    if a["operator_id"] != user["operator_id"]:
        raise HTTPException(403, "Only the owning organization can remove this asset")
    store.delete_asset(asset_id)
    return {"ok": True}


@app.post("/api/reset")
def reset(user: dict = Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
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
def brief(body: BriefRequest, user: dict = Depends(current_user)):
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
def plans(user: dict = Depends(current_user)):
    return store.plans()


@app.post("/api/plans")
def submit_plan(body: PlanIn, user: dict = Depends(current_user)):
    assets_ = store.assets()
    result = planner.assess(terrain, body.lander.physics(), body.lander.dispersion_m, body.site.x, body.site.y, assets_)
    plan = {
        "operator_id": user["operator_id"], "filed_by": user["email"], "name": body.name, "window": body.window,
        "lander": body.lander.model_dump(), "site": body.site.model_dump(),
        "summary": result["summary"],
    }
    notices = copilot.notices_for_plan(plan, result, assets_, store.operators())
    plan["status"] = "consultation" if notices else "cleared"
    saved = store.add_plan(plan, notices)
    return {"plan": saved, "notices_sent": len(notices)}


@app.get("/api/notices")
def notices(operator_id: str | None = None, user: dict = Depends(current_user)):
    # Each organisation only sees notices it sent or received.
    return store.notices(user["operator_id"])


@app.patch("/api/notices/{notice_id}")
def update_notice(notice_id: str, body: NoticeUpdate, user: dict = Depends(current_user)):
    existing = store.notice(notice_id)
    if not existing:
        raise HTTPException(404, "Unknown notice")
    if existing["to_operator_id"] != user["operator_id"]:
        raise HTTPException(403, "Only the notified organization can respond")
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
