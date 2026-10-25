"""Response contracts retain legacy keys and declare V2 additions."""

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict


class Output(BaseModel):
    model_config = ConfigDict(extra="allow")


class PointOut(Output):
    x: float
    y: float


class SiteOut(PointOut):
    elevation_m: float
    slope_deg: float


class Summary(Output):
    expected_loss_meur: float
    worst_asset_id: str | None
    worst_risk: str
    assets_at_risk: int


class AssetResult(Output):
    asset_id: str
    distance_m: float
    shielded: bool
    damage_fraction: float
    mechanisms: dict[str, float]
    expected_loss_meur: float
    risk: str
    energy_fluence_j_m2: float
    dust_mass_g_m2: float
    uncertainty: dict[str, Any]


class AssessmentOut(Output):
    site: SiteOut
    assets: list[AssetResult]
    summary: Summary
    compute_ms: float
    provenance: dict[str, Any]
    uncertainty: dict[str, Any]


class FootprintOut(Output):
    n: int
    radius_m: float
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    values: list[float]
    reference: str
    compute_ms: float
    metadata: dict[str, Any]
    valid_mask: list[bool]


class AlternativeOut(PointOut):
    expected_loss_meur: float
    traverse_meur: float
    total_cost_meur: float
    distance_from_target_m: float
    slope_deg: float


class OptimizationOut(Output):
    target: AssessmentOut
    best: AssessmentOut | None
    best_traverse_meur: float | None
    alternatives: list[AlternativeOut]
    search: dict[str, Any]
    compute_ms: float


class OrganizationOut(Output):
    id: str
    name: str
    short: str
    color: str


class AssetOut(PointOut):
    id: str
    operator_id: str
    name: str
    type: str
    value_meur: float


class PlanOut(Output):
    id: str
    operator_id: str
    name: str
    window: str
    lander: dict[str, Any]
    site: PointOut
    summary: dict[str, Any]
    status: str
    created_at: float
    revision: int = 1
    revision_id: str | None = None


class FiledOut(Output):
    plan: PlanOut
    notices_sent: int


class NoticeOut(Output):
    id: str
    plan_id: str
    from_operator_id: str
    to_operator_id: str
    asset_ids: list[str]
    max_risk: str
    expected_loss_meur: float
    subject: str
    body: str
    status: Literal["unread", "acknowledged", "objection"]
    created_at: float
    revision: int = 1
    revision_id: str | None = None
    read_at: float | None = None
    responded_at: float | None = None
    reply: str | None = None


class BriefOut(Output):
    markdown: str
    structured: dict | None = None
    source: Literal["claude", "openai", "template"]
    latency_ms: int


class AskOut(Output):
    answer: str
    points: list[str]
    source: Literal["claude", "openai", "template"]
    latency_ms: int


class SessionOut(Output):
    authenticated: bool
    demo_enabled: bool
    organization_id: str | None = None
    permissions: list[str] = []
    roles: list[str] = []
    csrf_token: str | None = None


class TerrainPointOut(SiteOut):
    pass


class TerrainMeshOut(Output):
    n: int
    size_m: float
    x_min: float
    y_min: float
    step_m: float
    label: str
    elevations_m: list[float]


class MetaOut(Output):
    terrain: dict[str, Any]
    landers: list[dict[str, Any]]
    asset_types: list[dict[str, Any]]
    risk_bands: list[dict[str, Any]]
    size_classes: list[dict[str, Any]]
    provenance: dict[str, Any]


class DetailOut(Output):
    plan: PlanOut
    revisions: list[dict[str, Any]]
    events: list[dict[str, Any]]
    notices: list[NoticeOut]
    coordination: dict[str, Any]


class EventOut(Output):
    id: str
    type: str
    created_at: float
    actor_id: str | None
    organization_id: str | None
    plan_id: str | None
    revision_id: str | None
    metadata: dict[str, Any]


class ErrorOut(BaseModel):
    detail: str | list[dict[str, Any]]
    request_id: str
