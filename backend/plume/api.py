"""PLUME V2 HTTP API: explicit local identity, immutable revisions and provenance."""

from __future__ import annotations
from pathlib import Path
from typing import Literal, Annotated
from urllib.parse import unquote
from datetime import datetime, timezone
import json, logging, re, time, uuid, sqlite3
from dataclasses import asdict
from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    Response as APIResponse,
    Depends,
    Query,
    Header,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel, Field, ConfigDict, model_validator
from . import copilot, planner, auth, accounts, drafts, coordination, dossier, ai_quota
from .contracts import *
from .budget import computation
from .database import Conflict
from .damage import ASSET_TYPES, RISK_BANDS
from .physics import SIZE_CLASSES, Lander, max_range_m
from .store import LANDER_PRESETS, Store
from .terrain import HALF, RES_M, SIZE_M, Terrain
from .provenance import provenance

settings = auth.Settings().validate()
app = FastAPI(
    title="PLUME",
    version="2.0",
    responses={
        401: {"model": ErrorOut},
        403: {"model": ErrorOut},
        409: {"model": ErrorOut},
        422: {"model": ErrorOut},
        503: {"model": ErrorOut},
    },
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Plume-CSRF", "Idempotency-Key"],
)
terrain = Terrain()
store = Store()
_hillshade = terrain.hillshade_png()
log = logging.getLogger("plume.api")


@app.middleware("http")
async def request_boundary(request, call_next):
    request.state.request_id = uuid.uuid4().hex
    start = time.monotonic()
    try:
        length = request.headers.get("content-length")
        if length and (not length.isdigit() or int(length) > 131072):
            raise HTTPException(413, "Request body limit is 128 KiB")
        if request.method in ("POST", "PATCH", "PUT"):
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 131072:
                    raise HTTPException(413, "Request body limit is 128 KiB")
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
    except HTTPException as e:
        response = JSONResponse(
            {"detail": e.detail, "request_id": request.state.request_id},
            status_code=e.status_code,
        )
    except Exception:
        log.exception("request_failed id=%s", request.state.request_id)
        response = JSONResponse(
            {"detail": "Internal server error", "request_id": request.state.request_id},
            status_code=500,
        )
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    log.info(
        "request id=%s method=%s status=%s duration_ms=%.1f",
        request.state.request_id,
        request.method,
        response.status_code,
        (time.monotonic() - start) * 1000,
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {"detail": exc.detail, "request_id": getattr(request.state, "request_id", "")},
        status_code=exc.status_code,
        headers=exc.headers,
    )


@app.exception_handler(sqlite3.Error)
async def database_error(request, exc):
    log.error("database_transaction_failed request_id=%s", request.state.request_id)
    return JSONResponse(
        {
            "detail": "Registry transaction unavailable; retry safely with the same idempotency key",
            "request_id": request.state.request_id,
        },
        status_code=503,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        {
            "detail": [
                {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]}
                for e in exc.errors()
            ],
            "request_id": request.state.request_id,
        },
        status_code=422,
    )


@app.exception_handler(Conflict)
async def conflict_error(request, exc):
    return JSONResponse(
        {"detail": str(exc), "request_id": request.state.request_id}, status_code=409
    )


def current_identity(request: Request):
    return auth.identity(request, store, settings)


IdentityDep = Annotated[auth.Identity, Depends(current_identity)]
Key = Annotated[
    str | None, Header(alias="Idempotency-Key", min_length=8, max_length=128)
]


def private_plan(plan_id, who):
    who.require("private:read")
    p = store.plan(plan_id)
    if not p:
        raise HTTPException(404, "Unknown plan")
    if p["operator_id"] != who.organization_id and not any(
        n["plan_id"] == plan_id for n in store.notices(who.organization_id)
    ):
        raise HTTPException(403, "Plan is private to consultation participants")
    return p


class Input(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False, str_strip_whitespace=True, extra="forbid"
    )


class LanderIn(Input):
    label: str = "Custom lander"
    thrust_kn: float = Field(gt=0.5, le=5_000)
    hover_s: float = Field(gt=1, le=300)
    dispersion_m: float = Field(ge=0, le=2_000)

    def physics(self) -> Lander:
        return Lander(self.thrust_kn, self.hover_s)


class Point(Input):
    x: float = Field(ge=-HALF, le=HALF)
    y: float = Field(ge=-HALF, le=HALF)


class SiteRequest(Input):
    lander: LanderIn
    site: Point


class ObjectionConstraint(Input):
    asset_id: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=2, max_length=500)
    max_damage_fraction: float | None = Field(None, ge=0, le=1)
    min_separation_m: float | None = Field(None, ge=0, le=30000)

    @model_validator(mode="after")
    def meaningful_reason(self):
        self.reason = self.reason.strip()
        if len(self.reason) < 2:
            raise ValueError("A structured objection requires a reason")
        return self


class OptimizeRequest(SiteRequest):
    plan_id: str | None = Field(None, max_length=100)
    constraints: list[ObjectionConstraint] = Field(default_factory=list, max_length=20)
    search_radius_m: float = Field(3_000, ge=500, le=8_000)
    traverse_meur_per_km: float = Field(2.0, ge=0, le=50)
    max_slope_deg: float = Field(8.0, ge=2, le=20)
    clearance_m: float = Field(300, ge=50, le=2_000)
    dispersion_margin_sigma: float = Field(0, ge=0, le=3)


class BriefRequest(SiteRequest):
    optimized_site: Point | None = None


class AskRequest(BriefRequest):
    question: str = Field(min_length=3, max_length=300)
    kind: Literal["why", "change", "free"] = "free"
    asset_id: str | None = Field(None, max_length=80)


class AssetIn(Input):
    operator_id: str
    name: str = Field(min_length=1, max_length=80)
    type: Literal[
        "habitat", "solar_array", "isru_plant", "comms_relay", "telescope", "rover"
    ]
    x: float = Field(ge=-HALF, le=HALF)
    y: float = Field(ge=-HALF, le=HALF)
    value_meur: float = Field(gt=0, le=10_000)


class PlanIn(SiteRequest):
    optimization_run_id: str | None = Field(None, max_length=100)
    operator_id: str
    name: str = Field(min_length=1, max_length=80)
    window: str = Field("", max_length=200)
    window_start: datetime | None = None
    window_end: datetime | None = None
    expected_revision: int | None = Field(None, ge=1)

    @model_validator(mode="after")
    def validate_window(self):
        if self.window_start is None and self.window_end is None:
            m = re.fullmatch(
                r"(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})[–-](\d{2}:\d{2}) UTC", self.window
            )
            if not m:
                raise ValueError(
                    "Use timezone-aware window_start and window_end; legacy text is read-only"
                )
            self.window_start = datetime.fromisoformat(m[1] + "T" + m[2] + ":00+00:00")
            self.window_end = datetime.fromisoformat(m[1] + "T" + m[3] + ":00+00:00")
        if (
            self.window_start is None
            or self.window_end is None
            or self.window_start.tzinfo is None
            or self.window_end.tzinfo is None
        ):
            raise ValueError("Both mission timestamps must include a timezone")
        if (
            not (
                2000 <= self.window_start.year <= 2200
                and 2000 <= self.window_end.year <= 2200
            )
            or self.window_end <= self.window_start
        ):
            raise ValueError(
                "Invalid mission window; start must precede end within years 2000–2200"
            )
        self.window_start = self.window_start.astimezone(timezone.utc)
        self.window_end = self.window_end.astimezone(timezone.utc)
        self.window = (
            self.window_start.isoformat() + " / " + self.window_end.isoformat()
        )
        return self


class DraftData(SiteRequest):
    name: str = Field("", max_length=80)
    window: str = Field("", max_length=200)
    mission_ready: bool = False
    editing_plan_id: str | None = Field(None, max_length=100)
    editing_revision: int | None = Field(None, ge=1)
    search_radius_m: float = Field(4000, ge=500, le=8000)
    traverse_meur_per_km: float = Field(2, ge=0, le=50)
    max_slope_deg: float = Field(8, ge=2, le=20)
    clearance_m: float = Field(300, ge=50, le=2000)
    optimization_run_id: str | None = Field(None, max_length=100)


class DraftUpdate(Input):
    expected_version: int = Field(ge=1)
    data: DraftData


class ExpectedDraftVersion(Input):
    expected_version: int = Field(ge=1)


class NoticeUpdate(Input):
    constraints: list[ObjectionConstraint] = Field(default_factory=list, max_length=20)
    status: Literal["acknowledged", "objection"]
    reply: str | None = Field(None, max_length=1_000)
    asset_ids: list[str] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def reason_required(self):
        if self.status != "objection" and self.constraints:
            raise ValueError("Constraints belong to an objection")
        if self.reply is not None:
            self.reply = self.reply.strip()
        if self.status == "objection" and not self.reply:
            raise ValueError("An objection requires a reason")
        return self


class DemoSessionIn(Input):
    operator_id: str


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0"}


@app.get("/api/ready")
def ready():
    with store.connect() as c:
        c.execute("SELECT 1").fetchone()
    return {
        "status": "ready",
        "database": "sqlite",
        "model_version": provenance(terrain)["model_version"],
    }


@app.get("/api/session", response_model=SessionOut)
def session(request: Request):
    if settings.demo:
        auth.local_request(request)
    try:
        who = auth.identity(request, store, settings, csrf=False)
    except HTTPException as e:
        if e.status_code != 401:
            raise
        return {"authenticated": False, "demo_enabled": settings.demo}
    with store.connect() as c:
        row = c.execute(
            "SELECT csrf FROM sessions WHERE id_hash=?",
            (auth.digest(request.cookies[auth.COOKIE]),),
        ).fetchone()
    account = accounts.public_user(store, who.user_id)
    view = accounts.account_view(store, who) if account else {}
    return {
        **view,
        "authenticated": True,
        "demo_enabled": settings.demo,
        "demo": who.demo,
        "user_id": who.user_id,
        "organization_id": who.organization_id,
        "roles": list(who.roles),
        "permissions": who.permissions,
        "csrf_token": row[0],
    }


@app.post("/api/session/demo", response_model=SessionOut)
def demo_session(body: DemoSessionIn, request: Request, response: APIResponse):
    return auth.create_session(request, response, store, settings, body.operator_id)


@app.delete("/api/session")
def logout(request: Request, response: APIResponse, who: IdentityDep):
    with store.transaction() as c:
        c.execute(
            "DELETE FROM sessions WHERE id_hash=?",
            (auth.digest(request.cookies[auth.COOKIE]),),
        )
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


class SignupIn(Input):
    model_config = ConfigDict(
        allow_inf_nan=False, str_strip_whitespace=False, extra="forbid"
    )
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    organization: Literal["create", "join"]
    organization_name: str | None = Field(None, max_length=80)
    invite_code: str | None = Field(None, max_length=40)


class LoginIn(Input):
    model_config = ConfigDict(
        allow_inf_nan=False, str_strip_whitespace=False, extra="forbid"
    )
    email: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)


@app.get("/api/auth/demo-accounts")
def demo_accounts(request: Request):
    if not settings.demo:
        return []
    auth.local_request(request)
    return accounts.demo_accounts(store, settings)


@app.post("/api/auth/signup", response_model=SessionOut)
def signup(body: SignupIn, request: Request, response: APIResponse):
    auth.local_request(request)
    user_id = accounts.signup(body, store)
    return accounts.session_payload(request, response, store, settings, user_id)


@app.post("/api/auth/login", response_model=SessionOut)
def login(body: LoginIn, request: Request, response: APIResponse):
    auth.local_request(request)
    # Provision published demo accounts only when explicitly enabled and locally requested.
    if body.email.strip().lower().endswith("@plume.demo") and settings.demo:
        accounts.demo_accounts(store, settings)
    user_id = accounts.login(body, request, store, settings)
    return accounts.session_payload(request, response, store, settings, user_id)


@app.get("/api/auth/me", response_model=SessionOut)
def me(request: Request, who: IdentityDep):
    return session(request)


@app.get("/api/organization/members")
def organization_members(who: IdentityDep):
    """Members of the signed-in user's organization only."""
    who.require("private:read")
    return accounts.members(store, who.organization_id)


@app.post("/api/auth/logout")
def account_logout(request: Request, response: APIResponse, who: IdentityDep):
    return logout(request, response, who)


@app.get("/api/meta", response_model=MetaOut)
def meta():
    return {
        "terrain": {
            "size_m": SIZE_M,
            "res_m": RES_M,
            "x_min": -HALF,
            "x_max": HALF,
            "y_min": -HALF,
            "y_max": HALF,
            "label": "Synthetic south-pole terrain (demo data)",
        },
        "landers": [
            {**p, "max_range_m": max_range_m(Lander(p["thrust_kn"], p["hover_s"]))}
            for p in LANDER_PRESETS
        ],
        "asset_types": [
            {
                **asdict(t),
                "erosion_50": t.erosion_50,
                "impact_50": t.impact_50,
                "coating_50": t.coating_50,
                "legacy_alias_semantics": "deprecated characteristic scales, not 50% thresholds",
            }
            for t in ASSET_TYPES.values()
        ],
        "risk_bands": [{"below": b, "name": n} for b, n in RISK_BANDS],
        "size_classes": [asdict(c) for c in SIZE_CLASSES],
        "provenance": provenance(terrain),
    }


@app.get("/api/terrain/hillshade.png")
def hillshade():
    return Response(
        _hillshade, media_type="image/png", headers={"Cache-Control": "max-age=3600"}
    )


@app.get("/api/terrain/point", response_model=TerrainPointOut)
def terrain_point(
    x: Annotated[float, Query(ge=-HALF, le=HALF, allow_inf_nan=False)],
    y: Annotated[float, Query(ge=-HALF, le=HALF, allow_inf_nan=False)],
):
    return {
        "x": x,
        "y": y,
        "elevation_m": float(terrain.elevation(x, y)),
        "slope_deg": float(terrain.slope_deg(x, y)),
    }


@app.get("/api/terrain/mesh", response_model=TerrainMeshOut)
def terrain_mesh():
    import numpy as np

    n = 201
    axis = np.linspace(-HALF, HALF, n)
    x, y = np.meshgrid(axis, axis)
    return {
        "n": n,
        "size_m": SIZE_M,
        "x_min": -HALF,
        "y_min": -HALF,
        "step_m": SIZE_M / (n - 1),
        "label": "Synthetic south-pole terrain (demo data)",
        "elevations_m": np.round(terrain.elevation(x, y), 2).ravel().tolist(),
        "provenance": provenance(terrain)["terrain"],
    }


@app.get("/api/operators", response_model=list[OrganizationOut])
def operators():
    return store.operators()


@app.get("/api/assets", response_model=list[AssetOut])
def assets():
    return store.assets()


@app.post("/api/assets", response_model=AssetOut)
def add_asset(body: AssetIn, who: IdentityDep):
    who.require("assets:write", body.operator_id)
    if len(store.assets()) >= 200:
        raise HTTPException(
            409, "Local computation registry limit is 200 active assets"
        )
    return store.add_asset(body.model_dump(), who.user_id)


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str, who: IdentityDep):
    a = store.asset(asset_id)
    if not a:
        raise HTTPException(404, "Unknown asset")
    who.require("assets:write", a["operator_id"])
    store.delete_asset(asset_id, who.user_id)
    return {"ok": True}


@app.post("/api/assess", response_model=AssessmentOut)
def assess(body: SiteRequest):
    with computation():
        return planner.assess(
            terrain,
            body.lander.physics(),
            body.lander.dispersion_m,
            body.site.x,
            body.site.y,
            store.assets(),
        )


@app.post("/api/footprint", response_model=FootprintOut)
def footprint(body: SiteRequest):
    with computation():
        return planner.footprint(
            terrain, body.lander.physics(), body.site.x, body.site.y
        )


@app.post("/api/optimize", response_model=OptimizationOut)
def optimize(body: OptimizeRequest, request: Request):
    who = (
        auth.identity(request, store, settings)
        if request.cookies.get(auth.COOKIE) or body.plan_id
        else None
    )
    plan = None
    if body.plan_id:
        plan = private_plan(body.plan_id, who)
        who.require("plans:write", plan["operator_id"])
    rules = [c.model_dump() for c in body.constraints] + (
        coordination.active_constraints(store, plan) if plan else []
    )
    assets = store.assets()
    if any(c["asset_id"] not in {a["id"] for a in assets} for c in rules):
        raise HTTPException(
            422, "Constraint asset is unavailable; review the registry and objection"
        )
    with computation():
        result = planner.optimize(
            terrain,
            body.lander.physics(),
            body.lander.dispersion_m,
            body.site.x,
            body.site.y,
            assets,
            body.search_radius_m,
            body.traverse_meur_per_km,
            body.max_slope_deg,
            body.clearance_m,
            dispersion_margin_sigma=body.dispersion_margin_sigma,
            constraints=rules,
        )
    if who:
        who.require("plans:write")
        run_id = "OR-" + uuid.uuid4().hex
        evidence = {
            "inputs": body.model_dump(mode="json"),
            "constraints": rules,
            "assets": assets,
            "provenance": provenance(terrain),
            "result": result,
        }
        with store.transaction() as c:
            c.execute(
                "INSERT INTO optimization_runs VALUES(?,?,?,?,?,?,?)",
                (
                    run_id,
                    who.organization_id,
                    who.user_id,
                    time.time(),
                    plan["id"] if plan else None,
                    plan.get("revision", 1) if plan else None,
                    json.dumps(evidence, allow_nan=False),
                ),
            )
        result["run_id"] = run_id
    return result


@app.get("/api/optimization-runs/{run_id}")
def optimization_run(run_id: str, who: IdentityDep):
    who.require("private:read")
    with store.connect() as c:
        row = c.execute(
            "SELECT * FROM optimization_runs WHERE id=? AND organization_id=?",
            (run_id, who.organization_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Optimization evidence not found")
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "plan_revision": row["plan_revision"],
        **json.loads(row["payload"]),
    }


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
            flu = exposure(
                lander, xs, np.zeros_like(xs), np.zeros_like(d), d, t.default_height_m
            )
            series[t.key] = np.round(damage_fraction(t, flu)["total"], 6).tolist()
        out.append(
            {
                "lander": p["id"],
                "label": p["label"],
                "eroded_mass_kg": lander.eroded_mass_kg,
                "damage": series,
            }
        )
    # Historical check: Apollo 12 descent vs Surveyor 3 at ~160 m.
    apollo = Lander(15, 60)
    s_xs = np.linspace(0.02, 0.97, 40)[None, :] * 160
    s_flu = exposure(
        apollo, s_xs, np.zeros_like(s_xs), np.zeros(1), np.array([160.0]), 1.5
    )
    return {
        "distance_m": d.round(1).tolist(),
        "series": out,
        "surveyor_check": {
            "distance_m": 160,
            "energy_fluence_j_m2": float(s_flu["energy_total"][0]),
            "fine_mass_g_m2": float(
                (s_flu["mass_dust"] + s_flu["mass_sand"])[0] * 1000
            ),
        },
    }


def _ai_quota(who, kind: str) -> str | None:
    """Count a paid model request for the caller's organization (template answers are free)."""
    if copilot.provider() is None:
        return None
    return ai_quota.reserve(store, who.organization_id, who.user_id, kind)


@app.get("/api/copilot/usage")
def copilot_usage(who: IdentityDep):
    """The caller's organization AI usage against its quota."""
    who.require("private:read")
    return {"provider": copilot.provider(), **ai_quota.usage(store, who.organization_id)}


@app.post("/api/copilot/ask", response_model=AskOut)
def copilot_ask(body: AskRequest, who: IdentityDep):
    """Grounded question about the current draft; same guardrails as the brief."""
    who.require("private:read")
    a = store.assets()
    if body.asset_id and not any(x["id"] == body.asset_id for x in a):
        raise HTTPException(404, "Unknown asset")
    with computation():
        lander = body.lander.physics()
        base = planner.assess(terrain, lander, body.lander.dispersion_m, body.site.x, body.site.y, a)
        opt = (
            planner.assess(terrain, lander, body.lander.dispersion_m, body.optimized_site.x, body.optimized_site.y, a)
            if body.optimized_site
            else None
        )
    quota = _ai_quota(who, "ask")
    return copilot.ask(
        body.lander.model_dump(), base, a, store.operators(), body.question, body.kind, body.asset_id, opt,
        quota_reason=quota,
    )


@app.post("/api/copilot/brief", response_model=BriefOut)
def brief(body: BriefRequest, who: IdentityDep):
    who.require("private:read")
    a = store.assets()
    with computation():
        base = planner.assess(
            terrain,
            body.lander.physics(),
            body.lander.dispersion_m,
            body.site.x,
            body.site.y,
            a,
        )
        opt = (
            planner.assess(
                terrain,
                body.lander.physics(),
                body.lander.dispersion_m,
                body.optimized_site.x,
                body.optimized_site.y,
                a,
            )
            if body.optimized_site
            else None
        )
    result = copilot.brief(
        body.lander.model_dump(), base, a, store.operators(), opt, quota_reason=_ai_quota(who, "brief")
    )
    return {
        **result,
        "structured_assessment": base,
        "narrative_is_safety_certification": False,
    }


@app.get("/api/drafts")
def list_drafts(who: IdentityDep):
    return drafts.listing(store, who)


@app.post("/api/drafts")
def create_draft(body: DraftData, who: IdentityDep, idempotency_key: Key = None):
    if body.editing_plan_id:
        who.require(
            "plans:write", private_plan(body.editing_plan_id, who)["operator_id"]
        )
    return drafts.create(store, who, body.model_dump(mode="json"), idempotency_key)


@app.get("/api/drafts/{draft_id}")
def get_draft(draft_id: str, who: IdentityDep):
    return drafts.get(store, who, draft_id)


@app.patch("/api/drafts/{draft_id}")
def save_draft(draft_id: str, body: DraftUpdate, who: IdentityDep):
    if body.data.editing_plan_id:
        who.require(
            "plans:write", private_plan(body.data.editing_plan_id, who)["operator_id"]
        )
    return drafts.update(
        store, who, draft_id, body.expected_version, body.data.model_dump(mode="json")
    )


@app.post("/api/drafts/{draft_id}/archive")
def archive_draft(draft_id: str, body: ExpectedDraftVersion, who: IdentityDep):
    return drafts.update(store, who, draft_id, body.expected_version, status="archived")


@app.post("/api/drafts/{draft_id}/restore")
def restore_draft(draft_id: str, body: ExpectedDraftVersion, who: IdentityDep):
    return drafts.update(store, who, draft_id, body.expected_version, status="draft")


@app.post("/api/drafts/{draft_id}/file", response_model=FiledOut)
def file_draft(
    draft_id: str,
    body: ExpectedDraftVersion,
    who: IdentityDep,
    idempotency_key: Key = None,
):
    who.require("plans:write")
    if not idempotency_key:
        raise HTTPException(400, "Idempotency-Key required")
    draft = drafts.get(store, who, draft_id)
    if draft["status"] == "filed":
        # A completed conversion is stable under network retries; never duplicate the plan.
        p = store.plan(draft["filed_plan_id"])
        return {
            "plan": p,
            "notices_sent": sum(
                n.get("revision_id") == p.get("revision_id") for n in store.notices()
            ),
        }
    if draft["status"] != "draft" or draft["version"] != body.expected_version:
        raise Conflict("Draft is archived or has changed; reload it before filing")
    d = draft["data"]
    dates = d["window"].split(" / ")
    params = {
        "operator_id": who.organization_id,
        "name": d["name"],
        "window": d["window"],
        "lander": d["lander"],
        "site": d["site"],
        "expected_revision": d.get("editing_revision"),
        "optimization_run_id": d.get("optimization_run_id"),
    }
    if len(dates) == 2:
        params.update(window_start=dates[0], window_end=dates[1])
    try:
        plan = PlanIn(**params)
    except Exception as e:
        raise HTTPException(
            422,
            "Complete the mission name, valid parameters and UTC window before filing",
        ) from e
    return file_plan(plan, who, idempotency_key, d.get("editing_plan_id"), draft)


@app.get("/api/plans", response_model=list[PlanOut])
def plans(who: IdentityDep):
    who.require("private:read")
    visible = {n["plan_id"] for n in store.notices(who.organization_id)}
    return [
        p
        for p in store.plans()
        if p["operator_id"] == who.organization_id or p["id"] in visible
    ]


def file_plan(body, who, key, plan_id=None, draft=None):
    who.require("plans:write", body.operator_id)
    if not key:
        raise HTTPException(400, "Idempotency-Key required")
    if plan_id:
        old = private_plan(plan_id, who)
        who.require("plans:write", old["operator_id"])
    a = store.assets()
    rules = coordination.active_constraints(store, old) if plan_id else []
    optimization_evidence = None
    if body.optimization_run_id:
        optimization_evidence = optimization_run(body.optimization_run_id, who)
        inputs = optimization_evidence["inputs"]
        if inputs["lander"] != body.lander.model_dump():
            raise HTTPException(
                422, "Optimization belongs to different lander parameters; recalculate"
            )
        candidates = [
            optimization_evidence["result"].get("best_explanation"),
            *optimization_evidence["result"].get("alternatives", []),
        ]
        if not any(
            c
            and abs(c["x"] - body.site.x) < 0.001
            and abs(c["y"] - body.site.y) < 0.001
            for c in candidates
        ):
            raise HTTPException(
                422,
                "Selected site is not an evaluated feasible alternative from this run",
            )
        if inputs.get("plan_id") != plan_id:
            raise HTTPException(422, "Optimization belongs to a different proposal")
        if plan_id and optimization_evidence["plan_revision"] != old.get("revision", 1):
            raise HTTPException(409, "Optimization predates the current revision; recalculate")
        # Manual limits used in an optimization remain part of the filing evidence.
        rules += [
            r
            for r in optimization_evidence["constraints"]
            if not r.get("source_notice_id")
        ]
    with computation():
        result = planner.assess(
            terrain,
            body.lander.physics(),
            body.lander.dispersion_m,
            body.site.x,
            body.site.y,
            a,
        )
    constraint_evaluation = coordination.evaluate(
        result["assets"], body.site.x, body.site.y, a, rules
    )
    if optimization_evidence:
        limits = optimization_evidence["inputs"]
        clearance = limits["clearance_m"] + limits.get("dispersion_margin_sigma", 0) * body.lander.dispersion_m
        nearest = min((float(((body.site.x - asset["x"]) ** 2 +
                              (body.site.y - asset["y"]) ** 2) ** .5) for asset in a), default=float("inf"))
        if result["site"]["slope_deg"] > limits["max_slope_deg"] or nearest < clearance:
            raise HTTPException(422, "Current registry or terrain violates optimization slope/clearance limits; recalculate")
    if not constraint_evaluation["satisfied"]:
        raise HTTPException(
            422,
            {
                "message": "Requested coordination constraints are not satisfied by this revision",
                "checks": constraint_evaluation["checks"],
            },
        )
    plan = {
        "constraint_evaluation": constraint_evaluation,
        "optimization_run_id": body.optimization_run_id,
        "operator_id": body.operator_id,
        "name": body.name,
        "window": body.window,
        "window_start": body.window_start.isoformat(),
        "window_end": body.window_end.isoformat(),
        "lander": body.lander.model_dump(),
        "site": body.site.model_dump(),
        "summary": result["summary"],
    }
    previous = (
        {n["to_operator_id"] for n in store.notices() if n["plan_id"] == plan_id}
        if plan_id
        else set()
    )
    accessible_ids = {n["plan_id"] for n in store.notices(who.organization_id)}
    overlap = []
    for other in store.plans():
        if (
            other["id"] == plan_id
            or other["status"] == "withdrawn"
            or (
                other["operator_id"] != who.organization_id
                and other["id"] not in accessible_ids
            )
        ):
            continue
        if other.get("window_start") and other.get("window_end"):
            if body.window_start < datetime.fromisoformat(
                other["window_end"]
            ) and body.window_end > datetime.fromisoformat(other["window_start"]):
                overlap.append(other["id"])
    plan["temporal_conflicts"] = {
        "overlapping_visible_plan_ids": overlap,
        "scope": "own plans and existing consultation participants",
        "physically_modeled_interaction": False,
        "legacy_free_text_windows": "not comparable",
    }
    notices = copilot.notices_for_plan(plan, result, a, store.operators(), previous)
    previous_notices = (
        [
            n
            for n in store.notices()
            if n["plan_id"] == plan_id
            and n.get("revision", 1) == old.get("revision", 1)
        ]
        if plan_id
        else []
    )
    for notice in notices:
        prior = next(
            (
                n
                for n in previous_notices
                if n["to_operator_id"] == notice["to_operator_id"]
            ),
            None,
        )
        if prior and prior["status"] != "acknowledged":
            notice["constraints"] = prior.get("constraints", [])
    snapshot = {
        "organization": next((o for o in store.operators() if o['id'] == who.organization_id), None),
        "consultations_at_filing": [dict(n, response_history=store.responses(n['id']))
            for n in store.notices() if n['plan_id'] == plan_id] if plan_id else [],
        "coordination_constraints": rules,
        "constraint_evaluation": constraint_evaluation,
        "optimization": optimization_evidence,
        "source_draft": draft,
        "assessment": result,
        "inputs": body.model_dump(mode="json"),
        "assets": a,
        "provenance": provenance(terrain),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": 0,
        "sample_count": 48,
    }
    saved = store.file_revision(
        plan,
        notices,
        snapshot,
        who.user_id,
        plan_id,
        key,
        body.expected_revision,
        {**body.model_dump(mode="json"), "draft_id": draft["id"] if draft else None},
        draft_id=draft["id"] if draft else None,
        draft_version=draft["version"] if draft else None,
    )
    created = [
        n for n in store.notices() if n.get("revision_id") == saved["revision_id"]
    ]
    return {"plan": saved, "notices_sent": len(created)}


@app.post("/api/plans", response_model=FiledOut)
def submit_plan(body: PlanIn, who: IdentityDep, idempotency_key: Key = None):
    return file_plan(body, who, idempotency_key)


@app.post("/api/plans/{plan_id}/revisions", response_model=FiledOut)
def revise_plan(
    plan_id: str, body: PlanIn, who: IdentityDep, idempotency_key: Key = None
):
    return file_plan(body, who, idempotency_key, plan_id)


@app.get("/api/plans/{plan_id}", response_model=DetailOut)
def plan_detail(plan_id: str, who: IdentityDep):
    p = private_plan(plan_id, who)
    rows = store.revisions(plan_id)
    notices = [n for n in store.notices(who.organization_id) if n["plan_id"] == plan_id]
    for notice in notices:
        notice["response_history"] = store.responses(notice["id"])
    for row in rows:
        row["historical_assessment"] = store.assessment(row["revision_id"])
        if row["historical_assessment"] and p["operator_id"] != who.organization_id:
            historical = row["historical_assessment"]
            if "consultations_at_filing" in historical:
                historical["consultations_at_filing"] = [n for n in historical["consultations_at_filing"]
                    if n["to_operator_id"] == who.organization_id]
        row["immutable_inputs"] = True
    return {
        "plan": p,
        "revisions": rows,
        "events": [
            {k: v for k, v in e.items() if k != "payload"}
            for e in store.events(plan_id)
        ],
        "notices": notices,
        "coordination": {
            "status": p["status"],
            "current_revision": p.get("revision", 1),
            "rule": "all required recipients must acknowledge the current revision; earlier objections retained",
            "safety_certification": False,
        },
    }


@app.get("/api/plans/{plan_id}/revisions/{number}/dossier")
def decision_dossier(plan_id: str, number: int, who: IdentityDep,
                     format: Literal["json", "pdf"] = "json"):
    detail = plan_detail(plan_id, who)
    revision = next((r for r in detail["revisions"] if r.get("revision", 1) == number), None)
    if revision is None:
        raise HTTPException(404, "Revision not found")
    snapshot = revision.get("historical_assessment")
    frozen_plan = {k:v for k,v in revision.items() if k != "historical_assessment"}
    data = {
        "title": dossier.TITLE,
        "schema_version": 1,
        "frozen_revision": {
            "plan": frozen_plan,
            "snapshot": snapshot,
            "revision_history": [{k:r.get(k) for k in
                ("id", "revision", "revision_id", "name", "site", "lander", "summary", "created_at")}
                for r in detail["revisions"] if r.get("revision", 1) <= number],
            "consultations_at_filing": snapshot.get("consultations_at_filing") if snapshot else None,
            "historical_policy": "Frozen at filing; missing legacy evidence is not reconstructed",
        },
        "current_coordination": {
            **detail["coordination"],
            "as_of": datetime.now(timezone.utc).isoformat(),
            "visible_consultations": detail["notices"],
            "events": detail["events"],
            "scope": "Consultations visible to the requesting organization; live, not frozen revision approval",
        },
        "scientific_limits": dossier.LIMITS,
    }
    filename = f"PLUME-decision-{plan_id}-r{number}.{format}"
    if format == "pdf":
        content = dossier.pdf_bytes(data)
        media = "application/pdf"
    else:
        content = json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2)
        media = "application/json"
    return Response(content=content, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
    })


@app.get("/api/plans/{plan_id}/events", response_model=list[EventOut])
def plan_events(plan_id: str, who: IdentityDep):
    private_plan(plan_id, who)
    return [
        {k: v for k, v in e.items() if k != "payload"} for e in store.events(plan_id)
    ]


@app.post("/api/plans/{plan_id}/reassess", response_model=AssessmentOut)
def reassess(plan_id: str, who: IdentityDep):
    p = private_plan(plan_id, who)
    who.require("plans:write", p["operator_id"])
    body = SiteRequest(lander=p["lander"], site=p["site"])
    result = assess(body)
    with store.transaction() as c:
        store.event(
            c,
            "CURRENT_REGISTRY_REASSESSED",
            who.user_id,
            who.organization_id,
            plan_id,
            p.get("revision_id"),
            {"summary": result["summary"], "historical_snapshot_unchanged": True},
        )
    return result


@app.post("/api/plans/{plan_id}/withdraw", response_model=PlanOut)
def withdraw(plan_id: str, who: IdentityDep):
    p = private_plan(plan_id, who)
    who.require("plans:write", p["operator_id"])
    return store.withdraw(plan_id, who.user_id, who.organization_id)


@app.get("/api/notices", response_model=list[NoticeOut])
def notices(who: IdentityDep, operator_id: str | None = None):
    who.require("private:read", operator_id or who.organization_id)
    return store.notices(who.organization_id)


def accessible_notice(notice_id, who, respond=False):
    n = store.notice(notice_id)
    if not n:
        raise HTTPException(404, "Unknown notice")
    if respond:
        who.require("notices:respond", n["to_operator_id"])
    elif who.organization_id not in (n["from_operator_id"], n["to_operator_id"]):
        raise HTTPException(403, "Consultation participant required")
    return n


@app.patch("/api/notices/{notice_id}", response_model=NoticeOut)
def update_notice(
    notice_id: str, body: NoticeUpdate, who: IdentityDep, idempotency_key: Key = None
):
    notice = accessible_notice(notice_id, who, True)
    if body.status == "objection" and not body.asset_ids:
        body.asset_ids = notice["asset_ids"]
    if not idempotency_key:
        raise HTTPException(400, "Idempotency-Key required")
    return store.respond(
        notice_id,
        body.status,
        body.reply,
        body.asset_ids,
        who.user_id,
        who.organization_id,
        idempotency_key,
        constraints=[c.model_dump() for c in body.constraints],
    )


@app.post("/api/notices/{notice_id}/read", response_model=NoticeOut)
def read_notice(notice_id: str, who: IdentityDep):
    n = accessible_notice(notice_id, who)
    who.require("private:read", n["to_operator_id"])
    return store.mark_read(notice_id, who.user_id, who.organization_id)


@app.get("/api/notices/{notice_id}/responses")
def notice_responses(notice_id: str, who: IdentityDep):
    accessible_notice(notice_id, who)
    return store.responses(notice_id)


@app.get("/api/inbox/counts")
def inbox_counts(who: IdentityDep):
    rows = [
        n
        for n in store.notices(who.organization_id)
        if n["to_operator_id"] == who.organization_id
    ]
    return {
        "unread": sum(
            n.get("read_at") is None and n["status"] == "unread" for n in rows
        ),
        "awaiting_response": sum(n["status"] == "unread" for n in rows),
        "total": len(rows),
    }


@app.api_route(
    "/api/{unknown_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
def unknown_api(unknown_path: str):
    raise HTTPException(404, "API route not found")


# StaticFiles handles file serving after an explicit normalized containment check.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="static")
    static = StaticFiles(directory=DIST, html=True, follow_symlink=False)

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str, request: Request):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API route not found")
        decoded = path
        for _ in range(8):
            decoded = unquote(decoded)
        if decoded == "api" or decoded.startswith("api/"):
            raise HTTPException(404, "API route not found")
        parts = decoded.replace("\\", "/").split("/")
        f = (DIST / decoded).resolve()
        if (
            any(p.startswith(".") for p in parts if p)
            or "\\" in decoded
            or ":" in decoded
            or decoded.startswith("/")
            or not f.is_relative_to(DIST.resolve())
        ):
            raise HTTPException(404, "Not found")
        return await static.get_response(
            decoded if f.is_file() else "index.html", request.scope
        )
