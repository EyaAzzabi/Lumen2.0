import { useState } from "react";
import { fmtKm, fmtMeur, fmtPct, RISK_COLOR } from "../api";
import { useMission, type Layers } from "../mission";
import { Icon, type IconName } from "./Icon";
import { Markdown } from "../ui";
import NumericInput from "./NumericInput";

const layerNames: [keyof Layers, string, IconName][] = [
  ["terrain", "Lunar terrain", "Mountain"],
  ["infrastructure", "Infrastructure", "Box"],
  ["zones", "Landing zone", "Target"],
  ["hazard", "Hazard exposure", "ShieldCheck"],
  ["candidates", "Optimizer candidates", "Sparkles"],
];

export function OperationsPanel() {
  const name = useMission((s) => s.missionName),
    lander = useMission((s) => s.lander),
    site = useMission((s) => s.site),
    layers = useMission((s) => s.layers),
    assets = useMission((s) => s.assets),
    operators = useMission((s) => s.operators),
    selected = useMission((s) => s.selectedAsset),
    place = useMission((s) => s.placeMode),
    assessment = useMission((s) => s.assessment),
    organization = useMission((s) => s.organization);
  const [expanded, setExpanded] = useState(true);
  return (
    <aside className="floating-panel operations-panel">
      <div className="panel-header">
        <span>MISSION OVERVIEW</span>
        <span className="live-label">
          <span className="status-dot" /> LIVE API
        </span>
      </div>
      <div className="panel-content">
        <div className="mission-id">
          <span>{organization?.short ?? "PLUME"} / SURFACE OPERATIONS</span>
          <h2>{name || "Untitled mission"}</h2>
          <div className="subtle-tag">PLANNING SCENARIO · 2040</div>
        </div>
        <button
          className="lander-summary"
          onClick={() => useMission.getState().setMode("setup")}
        >
          <Icon name="Box" size={28} />
          <span>
            {lander.label}
            <small>
              {lander.thrust_kn.toLocaleString()} kN <i /> {lander.hover_s} s
              hover
            </small>
          </span>
          <Icon name="ChevronRight" size={15} />
        </button>
        <div className="panel-subtitle spaced">PROPOSED LANDING SITE</div>
        <div className="coordinate-readout">
          <span>
            E <b>{(site.x / 1000).toFixed(2)}</b>
            <em>km</em>
          </span>
          <span>
            N <b>{(site.y / 1000).toFixed(2)}</b>
            <em>km</em>
          </span>
        </div>
        <button
          className={`outline-button full ${place ? "armed" : ""}`}
          aria-pressed={place}
          onClick={() => {
            useMission.setState({ placeMode: !place });
            if (!place) useMission.getState().focus("top");
          }}
        >
          <Icon name="Crosshair" size={15} />
          {place ? "CLICK TERRAIN TO PLACE" : "REPOSITION LANDING SITE"}
        </button>
        <p className="panel-note">
          {place
            ? "Click the surface, or use coordinate fields in Mission Setup. Escape cancels."
            : "Local east / north reference frame"}
        </p>
      </div>
      <div className="panel-section">
        <button
          className="section-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span>
            <Icon name="Layers" size={15} /> MAP LAYERS
          </span>
          <Icon name="ChevronDown" size={14} />
        </button>
        {expanded && (
          <div className="layer-list">
            {layerNames.map(([key, label, icon]) => (
              <label key={key}>
                <Icon name={icon} size={15} />
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) =>
                    useMission.setState({
                      layers: { ...layers, [key]: e.target.checked },
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="panel-section infrastructure-section">
        <div className="panel-subtitle row between">
          SHARED INFRASTRUCTURE{" "}
          <span className="count-badge">
            {assets.length.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="asset-list">
          {assets.map((a) => {
            const result = assessment?.assets.find((r) => r.asset_id === a.id),
              op = operators.find((o) => o.id === a.operator_id);
            return (
              <button
                className={`asset-list-item ${selected === a.id ? "active" : ""}`}
                key={a.id}
                onClick={() => useMission.getState().selectAsset(a.id)}
              >
                <span className="asset-symbol" style={{ color: op?.color }}>
                  <Icon
                    name={
                      a.type === "habitat"
                        ? "Box"
                        : a.type === "solar_array"
                          ? "Zap"
                          : a.type === "comms_relay"
                            ? "Radio"
                            : a.type === "rover"
                              ? "Gauge"
                              : "Target"
                    }
                    size={16}
                  />
                </span>
                <span>
                  {a.name.replace(" (parked)", "")}
                  <small>
                    {op?.short} · {a.type.replace("_", " ")}
                  </small>
                </span>
                <span
                  className="asset-status"
                  style={{
                    background: result ? RISK_COLOR[result.risk] : "#778595",
                  }}
                  title={result?.risk ?? "Awaiting assessment"}
                />
              </button>
            );
          })}
        </div>
        <p className="panel-note">Fictional installations · demo registry</p>
      </div>
    </aside>
  );
}

export function ExposurePanel() {
  const assessment = useMission((s) => s.assessment),
    busy = useMission((s) => s.busy),
    assets = useMission((s) => s.assets),
    selected = useMission((s) => s.selectedAsset),
    mode = useMission((s) => s.mode),
    brief = useMission((s) => s.brief);
  const a = assets.find((a) => a.id === selected),
    result = assessment?.assets.find((r) => r.asset_id === selected),
    summary = assessment?.summary;
  const sorted = [...(assessment?.assets ?? [])].sort(
    (a, b) => b.expected_loss_meur - a.expected_loss_meur,
  );
  return (
    <aside className="floating-panel exposure-panel">
      <div className="panel-header">
        <span>PLUME RISK ASSESSMENT</span>
        <Icon name="ShieldCheck" size={16} />
      </div>
      <div className="panel-content">
        <div className="metric-caption">MODELED LOSS TO REGISTERED ASSETS</div>
        <div
          className="hero-metric"
          style={{
            color: summary ? RISK_COLOR[summary.worst_risk] : undefined,
          }}
        >
          {summary ? fmtMeur(summary.expected_loss_meur) : "—"}
          <span>EUR</span>
        </div>
        <div className="assessment-status">
          <span
            className="risk-pill"
            style={{
              color: summary ? RISK_COLOR[summary.worst_risk] : undefined,
            }}
          >
            <span className="status-dot" />
            {busy === "analysis"
              ? "ASSESSING"
              : summary
                ? `${summary.worst_risk.toUpperCase()} EXPOSURE`
                : "AWAITING ANALYSIS"}
          </span>
          {assessment && <small>{assessment.compute_ms.toFixed(0)} ms</small>}
        </div>
        <div className="mini-metrics">
          <div>
            <strong>
              {summary?.assets_at_risk ?? "—"}
              <small> / {assets.length}</small>
            </strong>
            <span>Assets at elevated+ risk</span>
          </div>
          <div>
            <strong>
              {assessment?.site.slope_deg.toFixed(1) ?? "—"}
              <small> °</small>
            </strong>
            <span>Local terrain slope</span>
          </div>
        </div>
        <button
          className="action-primary full"
          disabled={!!busy || !useMission.getState().connected}
          onClick={() => void useMission.getState().simulate()}
        >
          <Icon name="Play" size={15} />
          {busy === "analysis" ? "COMPUTING EXPOSURE…" : "SIMULATE LANDING"}
          <Icon name="ArrowRight" size={15} />
        </button>
        <p className="panel-note">
          Simplified physics model · no flight certification
        </p>
      </div>
      {a ? (
        <div className="panel-section asset-detail">
          <div className="row between">
            <span className="panel-subtitle">SELECTED INFRASTRUCTURE</span>
            <button
              className="icon-button"
              aria-label="Close asset details"
              onClick={() => useMission.getState().selectAsset(null)}
            >
              <Icon name="X" size={15} />
            </button>
          </div>
          <h3>{a.name}</h3>
          <p>{a.type.replace("_", " ")} · fictional installation</p>
          <dl className="data-list">
            <dt>Position E / N</dt>
            <dd>
              {(a.x / 1000).toFixed(2)} / {(a.y / 1000).toFixed(2)} km
            </dd>
            <dt>Replacement value</dt>
            <dd>{fmtMeur(a.value_meur)}</dd>
            <dt>Operational criticality</dt>
            <dd>Not assigned</dd>
            <dt>Modeled damage</dt>
            <dd>{result ? fmtPct(result.damage_fraction) : "Not assessed"}</dd>
            <dt>Distance from site</dt>
            <dd>{result ? fmtKm(result.distance_m) : "—"}</dd>
            <dt>Terrain shielding</dt>
            <dd>
              {result
                ? result.shielded
                  ? "Nominal exposure near zero"
                  : "Nominal exposure nonzero"
                : "—"}
            </dd>
            {result && (
              <>
                <dt>Energy fluence</dt>
                <dd>{result.energy_fluence_j_m2.toExponential(2)} J/m²</dd>
                {result.uncertainty && (
                  <>
                    <dt>Damage sample q95 / worst</dt>
                    <dd>
                      {fmtPct(result.uncertainty.q95)} /{" "}
                      {fmtPct(result.uncertainty.worst_sample_damage)}
                    </dd>
                    <dt>Valid samples / seed</dt>
                    <dd>
                      {result.uncertainty.valid_samples} /{" "}
                      {result.uncertainty.seed}
                    </dd>
                  </>
                )}
                <dt>Fine dust</dt>
                <dd>{result.dust_mass_g_m2.toFixed(2)} g/m²</dd>
              </>
            )}
          </dl>
        </div>
      ) : (
        <div className="panel-section">
          <div className="panel-subtitle">EXPOSURE BY ASSET</div>
          <div className="exposure-list">
            {sorted.slice(0, 5).map((r) => {
              const asset = assets.find((a) => a.id === r.asset_id);
              return (
                <button
                  key={r.asset_id}
                  onClick={() => useMission.getState().selectAsset(r.asset_id)}
                >
                  <div>
                    <span>{asset?.name.replace(" (parked)", "")}</span>
                    <b style={{ color: RISK_COLOR[r.risk] }}>
                      {fmtPct(r.damage_fraction)}
                    </b>
                  </div>
                  <div className="damage-track">
                    <span
                      style={{
                        width: `${Math.max(1, r.damage_fraction * 100)}%`,
                        background: RISK_COLOR[r.risk],
                      }}
                    />
                  </div>
                  <small>
                    {r.risk} · {fmtKm(r.distance_m)}
                  </small>
                </button>
              );
            })}
            {!assessment && (
              <p className="panel-note">
                Asset exposure appears after a successful backend assessment.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="panel-section optimizer-invitation">
        <div className="row">
          <Icon name="Sparkles" size={18} />
          <h3>A better place to land.</h3>
        </div>
        <p>
          Compare nearby sites against terrain, exposure and surface logistics.
        </p>
        <button
          className="outline-button full"
          onClick={() => useMission.getState().setMode("optimizer")}
        >
          OPEN LANDING OPTIMIZER <Icon name="ArrowRight" size={15} />
        </button>
      </div>
      {(mode === "simulation" || mode === "replay") && (
        <div className="panel-section">
          <button
            className="outline-button full"
            disabled={!!busy || !assessment}
            onClick={() => void useMission.getState().generateBrief()}
          >
            <Icon name="FileText" size={15} />
            {busy === "brief" ? "PREPARING BRIEF…" : "GENERATE MISSION BRIEF"}
          </button>
          {brief && (
            <>
              <span className="source-caption">
                {brief.source !== "template"
                  ? `${brief.source === "openai" ? "OpenAI" : "Claude"} · ${brief.model}`
                  : "Deterministic offline template"}{" "}
                · backend figures
              </span>
              <Markdown text={brief.markdown} />
            </>
          )}
        </div>
      )}
    </aside>
  );
}

export function OptimizerPanel() {
  const opt = useMission((s) => s.optimization),
    busy = useMission((s) => s.busy),
    site = useMission((s) => s.site),
    assets = useMission((s) => s.assets);
  const radius = useMission((s) => s.searchRadius),
    traverse = useMission((s) => s.traverseCost),
    slope = useMission((s) => s.maxSlope),
    clearance = useMission((s) => s.clearance);
  const candidates = [
    ...(opt?.best
      ? [
          {
            ...opt.best.site,
            expected_loss_meur: opt.best.summary.expected_loss_meur,
            traverse_meur: opt.best_traverse_meur ?? 0,
            total_cost_meur:
              opt.best.summary.expected_loss_meur +
              (opt.best_traverse_meur ?? 0),
            slope_deg: opt.best.site.slope_deg,
            distance_from_target_m: Math.hypot(
              opt.best.site.x - opt.target.site.x,
              opt.best.site.y - opt.target.site.y,
            ),
          },
        ]
      : []),
    ...(opt?.alternatives ?? []),
  ];
  return (
    <aside className="floating-panel exposure-panel optimizer-panel">
      <div className="panel-header">
        <span>LANDING SITE OPTIMIZER</span>
        <Icon name="Sparkles" size={16} />
      </div>
      <div className="panel-content">
        <div className="eyeline compact">CONSTRAINED SITE SEARCH</div>
        <h2>Find a safer footprint.</h2>
        <p className="panel-intro">
          Minimize modeled damage plus traverse cost. A lower objective is
          better.
        </p>
        <div className="optimizer-inputs">
          {(
            [
              {
                key: "searchRadius",
                label: "Search radius",
                unit: "m",
                value: radius,
                min: 500,
                max: 8000,
                step: 500,
              },
              {
                key: "traverseCost",
                label: "Traverse cost",
                unit: "M€/km",
                value: traverse,
                min: 0,
                max: 50,
                step: 0.5,
              },
              {
                key: "maxSlope",
                label: "Max slope",
                unit: "°",
                value: slope,
                min: 2,
                max: 20,
                step: 1,
              },
              {
                key: "clearance",
                label: "Asset clearance",
                unit: "m",
                value: clearance,
                min: 50,
                max: 2000,
                step: 50,
              },
            ] as const
          ).map((f) => (
            <label className="form-label" key={f.key}>
              {f.label}
              <div className="unit-input">
                <NumericInput
                  label={f.label}
                  value={f.value}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  disabled={!!busy}
                  onCommit={(value) =>
                    useMission.setState({ [f.key]: value, optimization: null })
                  }
                />
                <span>{f.unit}</span>
              </div>
            </label>
          ))}
        </div>
        <button
          className="action-primary full"
          disabled={!!busy || !useMission.getState().assessment}
          onClick={() => void useMission.getState().optimize()}
        >
          <Icon
            name={busy === "optimizer" ? "RefreshCw" : "Sparkles"}
            size={16}
            className={busy === "optimizer" ? "rotating" : ""}
          />
          {busy === "optimizer"
            ? "EVALUATING FEASIBLE SITES…"
            : "RUN OPTIMIZER"}
        </button>
        {opt?.method && (
          <p className="panel-note">
            {opt.method.rescored} dispersion-aware evaluations ·{" "}
            {opt.method.refined_count} local refinements. Best evaluated
            objective; no global-optimum proof.
          </p>
        )}
        {busy === "optimizer" && (
          <p className="panel-note" role="status">
            Backend screening terrain and asset clearances, then rescoring
            shortlisted sites with landing dispersion.
          </p>
        )}
      </div>
      {opt && (
        <>
          <details className="panel-section">
            <summary>Candidate visual comparison</summary>
            <CandidateComparison />
          </details>
          <div className="panel-section">
            <div className="search-summary">
              <span>
                <b>{opt.search.candidates.toLocaleString()}</b>screened
              </span>
              <span>
                <b>{opt.search.feasible.toLocaleString()}</b>feasible
              </span>
              <span>
                <b>{(opt.compute_ms / 1000).toFixed(1)} s</b>compute
              </span>
            </div>
            {opt.best_explanation && (
              <p className="panel-note">
                Selected by modeled loss + relocation cost. Nearest asset:{" "}
                {fmtKm(opt.best_explanation.nearest_asset_m)}. Maximum asset
                severity: {opt.best_explanation.worst_risk}.
              </p>
            )}
            <div className="baseline-loss">
              ORIGINAL MODELED LOSS{" "}
              <strong>{fmtMeur(opt.target.summary.expected_loss_meur)}</strong>
            </div>
          </div>
          <div className="panel-section candidate-list">
            {!candidates.length && (
              <div className="empty-state">
                <Icon name="TriangleAlert" />
                <h3>No feasible site found</h3>
                <p>
                  Adjust the search radius, slope or clearance constraints and
                  run again.
                </p>
              </div>
            )}
            {candidates.map((c, i) => {
              const selected = Math.hypot(c.x - site.x, c.y - site.y) < 1,
                nearest = Math.min(
                  ...assets.map((a) => Math.hypot(a.x - c.x, a.y - c.y)),
                );
              return (
                <div
                  className={`candidate-card ${selected ? "adopted" : ""}`}
                  key={i}
                >
                  <div className="row between">
                    <span className={i === 0 ? "best-label" : "panel-subtitle"}>
                      {i === 0 ? "BEST OBJECTIVE" : `ALTERNATIVE ${i}`}
                    </span>
                    <span className="mono">
                      {c.slope_deg.toFixed(1)}° slope
                    </span>
                  </div>
                  <div className="candidate-value">
                    {fmtMeur(c.total_cost_meur)}
                    <span>total objective</span>
                  </div>
                  <dl className="data-list">
                    <dt>Modeled loss</dt>
                    <dd>{fmtMeur(c.expected_loss_meur)}</dd>
                    <dt>Traverse cost</dt>
                    <dd>{fmtMeur(c.traverse_meur)}</dd>
                    <dt>Moved from origin</dt>
                    <dd>{fmtKm(c.distance_from_target_m)}</dd>
                    <dt>Nearest registry asset</dt>
                    <dd>
                      {Number.isFinite(nearest)
                        ? fmtKm(nearest)
                        : "None registered"}
                    </dd>
                  </dl>
                  <div className="candidate-coords">
                    E {(c.x / 1000).toFixed(2)} / N {(c.y / 1000).toFixed(2)} km
                  </div>
                  <button
                    className={`outline-button full ${selected ? "adopted-button" : ""}`}
                    disabled={selected || !!busy}
                    onClick={() => {
                      useMission.getState().moveSite({ x: c.x, y: c.y }, true);
                      useMission.getState().focus("site");
                      useMission
                        .getState()
                        .notify(
                          "Candidate adopted. Reassessing exposure at the selected coordinates.",
                        );
                    }}
                  >
                    <Icon name={selected ? "Check" : "Target"} size={15} />
                    {selected ? "CURRENT LANDING SITE" : "ADOPT THIS SITE"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="panel-section">
            <button
              className="outline-button full"
              onClick={() => {
                useMission
                  .getState()
                  .moveSite(
                    { x: opt.target.site.x, y: opt.target.site.y },
                    true,
                  );
                useMission.getState().focus("site");
              }}
            >
              COMPARE ORIGINAL SITE <Icon name="ArrowLeft" size={15} />
            </button>
            <button
              className="action-text full"
              onClick={() => useMission.getState().setMode("report")}
            >
              OPEN COORDINATION REPORT <Icon name="ArrowRight" size={15} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

export function SceneControls() {
  const mode = useMission((s) => s.mode),
    view = useMission((s) => s.cameraView),
    low = useMission((s) => s.lowGraphics),
    busy = useMission((s) => s.busy),
    assessment = useMission((s) => s.assessment),
    footprint = useMission((s) => s.footprint);
  const names = {
    operations: "South Pole Region",
    setup: "Prepare your landing mission",
    simulation: "Landing simulation",
    replay: "Temporal replay",
    optimizer: "Landing intelligence",
    report: "Coordination report",
    gateway: "",
    notices: "Cross-operator coordination",
    registry: "Shared lunar registry",
    method: "",
    login: "",
    pricing: "",
  };
  return (
    <>
      <div className="scene-heading">
        <div className="scene-eyebrow">
          SOUTH POLAR REGION <span>/</span> LOCAL FRAME · 30 × 30 KM
        </div>
        <h1>{names[mode]}</h1>
        <p>
          <span className="status-dot" />
          SYNTHETIC TERRAIN · FICTIONAL INFRASTRUCTURE
        </p>
      </div>
      <div
        className="view-controls"
        role="group"
        aria-label="Camera perspectives"
      >
        {(
          [
            ["overview", "Orbit", "Overview"],
            ["top", "Layers", "Top down"],
            ["site", "LocateFixed", "Landing site"],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            title={label}
            aria-label={label}
            aria-pressed={view === id}
            className={view === id ? "active" : ""}
            onClick={() => {
              useMission.setState({ tour: false });
              useMission.getState().focus(id);
            }}
          >
            <Icon name={icon} size={17} />
            <span>{label}</span>
          </button>
        ))}
        <i />
        <button
          title="Simplified graphics"
          aria-label="Simplified graphics"
          aria-pressed={low}
          onClick={() => useMission.setState({ lowGraphics: !low })}
        >
          <Icon name="Settings2" size={17} />
          <span>{low ? "LITE" : "HIGH"}</span>
        </button>
      </div>
      {mode !== "setup" && (
        <div className="map-legend">
          <div className="panel-subtitle">REFERENCE SOLAR-ARRAY DAMAGE</div>
          <div className="legend-colors">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="legend-values">
            <span>0.05%</span>
            <span>0.5%</span>
            <span>3%</span>
            <span>15%+</span>
          </div>
          <p>
            {footprint
              ? "Backend footprint · nominal site"
              : "Awaiting backend footprint"}
          </p>
          <div className="map-scale">
            <span />
            <b>1 km</b>
            <em>E at landing site</em>
          </div>
        </div>
      )}
      <div className="scene-help">
        <Icon name="Orbit" size={14} />
        <span>
          Drag to orbit <i /> Scroll to zoom <i /> Right-drag to pan
        </span>
      </div>
      {busy && (
        <div className="compute-status" role="status">
          <span className="spin" />
          {busy === "optimizer"
            ? "OPTIMIZER RUNNING ON BACKEND"
            : busy === "analysis"
              ? "COMPUTING TERRAIN-AWARE EXPOSURE"
              : busy === "brief"
                ? "PREPARING MISSION BRIEF"
                : "FILING COORDINATION PLAN"}
        </div>
      )}
      {assessment && mode === "setup" && (
        <div className="lander-annotation">
          <span>ILLUSTRATIVE VEHICLE / INSPECTION LIGHTING</span>
          <h3>{useMission.getState().lander.label}</h3>
          <p>
            Inspect by dragging. Model geometry is illustrative;
            <br />
            thrust, hover and dispersion drive the analysis.
          </p>
        </div>
      )}
    </>
  );
}

const LETTERS = ["A", "B", "C"];

function riskWord(r: string) {
  return r === "negligible"
    ? "Very low risk"
    : r === "low"
      ? "Low risk"
      : r === "elevated"
        ? "Elevated risk"
        : "Critical risk";
}

function Gauge({ value, color }: { value: number; color: string }) {
  // Arc length on a square-root scale so small but real damage stays visible.
  const r = 46,
    c = 2 * Math.PI * r,
    f = Math.min(1, Math.sqrt(value / 0.5));
  return (
    <svg className="risk-gauge" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={r} className="gauge-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="gauge-value"
        style={{ stroke: color, strokeDasharray: `${c * f} ${c}` }}
        transform="rotate(-90 60 60)"
      />
    </svg>
  );
}

export function CandidateComparison() {
  const opt = useMission((s) => s.optimization),
    site = useMission((s) => s.site),
    busy = useMission((s) => s.busy);
  const [pick, setPick] = useState(0);
  if (!opt) return null;
  const best = opt.best;
  const candidates = [
    ...(best
      ? [
          {
            x: best.site.x,
            y: best.site.y,
            expected_loss_meur: best.summary.expected_loss_meur,
            traverse_meur: opt.best_traverse_meur ?? 0,
            slope_deg: best.site.slope_deg,
            distance_from_target_m: Math.hypot(
              best.site.x - opt.target.site.x,
              best.site.y - opt.target.site.y,
            ),
            worst_risk: best.summary.worst_risk,
            worst_damage_fraction: Math.max(
              0,
              ...best.assets.map((a) => a.damage_fraction),
            ),
            assets_at_risk: best.summary.assets_at_risk,
            nearest_asset_m: best.assets.length
              ? Math.min(...best.assets.map((a) => a.distance_m))
              : null,
          },
        ]
      : []),
    ...opt.alternatives,
  ].slice(0, 3);
  const original = opt.target.summary;
  if (!candidates.length)
    return (
      <div className="panel-section">
        <div className="empty-state">
          <Icon name="TriangleAlert" />
          <h3>No feasible site found</h3>
          <p>
            Adjust the search radius, slope or clearance constraints and run
            again.
          </p>
        </div>
      </div>
    );
  const sel = candidates[Math.min(pick, candidates.length - 1)];
  const letter = LETTERS[Math.min(pick, candidates.length - 1)];
  const color = RISK_COLOR[sel.worst_risk];
  const adopted = Math.hypot(sel.x - site.x, sel.y - site.y) < 1;
  const reduction =
    original.expected_loss_meur > 0
      ? 1 - sel.expected_loss_meur / original.expected_loss_meur
      : 0;
  const adopt = (simulate: boolean) => {
    const s = useMission.getState();
    s.moveSite({ x: sel.x, y: sel.y }, true);
    s.focus("site");
    if (simulate) void s.simulate();
    else
      s.notify(
        `Site ${letter} confirmed. Reassessing exposure at the new coordinates.`,
      );
  };
  return (
    <>
      <div className="panel-section">
        <div className="panel-subtitle row between">
          CANDIDATE SITES COMPARISON
          <span className="mono faint">
            {opt.search.candidates.toLocaleString()} screened ·{" "}
            {(opt.compute_ms / 1000).toFixed(1)} s
          </span>
        </div>
        <div className="site-cards">
          {candidates.map((c, i) => {
            const col = RISK_COLOR[c.worst_risk];
            return (
              <button
                key={i}
                className={`site-card ${i === pick ? "selected" : ""}`}
                style={{ ["--site" as string]: col }}
                onClick={() => setPick(i)}
              >
                <span className="site-letter">{LETTERS[i]}</span>
                <span className="site-risk">{riskWord(c.worst_risk)}</span>
                <dl>
                  <dt>Worst</dt>
                  <dd style={{ color: col }}>
                    {fmtPct(c.worst_damage_fraction)}
                  </dd>
                  <dt>Loss</dt>
                  <dd>{fmtMeur(c.expected_loss_meur)}</dd>
                  <dt>Slope</dt>
                  <dd>{c.slope_deg.toFixed(1)}°</dd>
                  <dt>Nearest</dt>
                  <dd>
                    {c.nearest_asset_m != null ? fmtKm(c.nearest_asset_m) : "—"}
                  </dd>
                </dl>
                <span className="site-select">Select site {LETTERS[i]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-subtitle">RISK ANALYSIS (SELECTED SITE)</div>
        <div className="site-verdict">
          <span className="site-letter" style={{ ["--site" as string]: color }}>
            {letter}
          </span>
          <div>
            <b style={{ color }}>
              Site {letter} —{" "}
              {pick === 0 ? "Best evaluated choice" : `Alternative ${pick}`}
            </b>
            <small>
              {pick === 0
                ? "Lowest total objective: neighbour losses + surface logistics."
                : "Alternative evaluated objective."}
            </small>
          </div>
        </div>
        <div className="gauge-row">
          <div className="gauge-wrap">
            <Gauge value={sel.worst_damage_fraction} color={color} />
            <div className="gauge-label">
              <b>{fmtPct(sel.worst_damage_fraction)}</b>
              <small>worst-asset damage</small>
            </div>
          </div>
          <ul className="gauge-legend">
            <li>
              <i style={{ background: color }} /> Expected loss{" "}
              <b>{fmtMeur(sel.expected_loss_meur)}</b>
            </li>
            <li>
              <i style={{ background: "var(--ice)" }} /> Assets at elevated+{" "}
              <b>{sel.assets_at_risk}</b>
            </li>
            <li>
              <i style={{ background: "var(--gold)" }} /> Surface logistics{" "}
              <b>{fmtMeur(sel.traverse_meur)}</b>
            </li>
            <li>
              <i style={{ background: "var(--ok)" }} /> Vs requested site{" "}
              <b>{(reduction * 100).toFixed(1)}% less loss</b>
            </li>
          </ul>
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-subtitle">IMPACT PREVIEW</div>
        <dl className="data-list">
          <dt>Requested site loss</dt>
          <dd style={{ color: RISK_COLOR[original.worst_risk] }}>
            {fmtMeur(original.expected_loss_meur)} · {original.worst_risk}
          </dd>
          <dt>Moved from requested</dt>
          <dd>{fmtKm(sel.distance_from_target_m)}</dd>
          <dt>Distance to nearest asset</dt>
          <dd>
            {sel.nearest_asset_m != null ? fmtKm(sel.nearest_asset_m) : "—"}
          </dd>
          <dt>Coordinates (E / N)</dt>
          <dd>
            {(sel.x / 1000).toFixed(2)} / {(sel.y / 1000).toFixed(2)} km
          </dd>
        </dl>
        <button
          className="confirm-site"
          disabled={adopted || !!busy}
          onClick={() => adopt(false)}
        >
          {adopted
            ? `Site ${letter} is the current landing site`
            : `Confirm Site ${letter}`}
          <Icon name={adopted ? "Check" : "ArrowRight"} size={18} />
        </button>
        <button
          className="outline-button full"
          disabled={!!busy}
          onClick={() => adopt(true)}
        >
          <Icon name="Play" size={15} /> RUN DETAILED SIMULATION
        </button>
        <button
          className="action-text full"
          onClick={() => {
            useMission
              .getState()
              .moveSite({ x: opt.target.site.x, y: opt.target.site.y }, true);
            useMission.getState().focus("site");
          }}
        >
          <Icon name="ArrowLeft" size={15} /> COMPARE REQUESTED SITE
        </button>
      </div>
    </>
  );
}
