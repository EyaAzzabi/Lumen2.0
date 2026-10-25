import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { api, fmtKm, fmtMeur, fmtPct, RISK_COLOR, type Pt } from "../api";
import { useMission, elevationAt } from "../mission";
import { Icon } from "./Icon";
import { Markdown } from "../ui";
import PlanHistory from "./PlanHistory";
import NumericInput from "./NumericInput";

const steps = [
  {
    mode: "setup",
    name: "Prepare",
    caption: "Define your mission",
    icon: "Box",
  },
  {
    mode: "operations",
    name: "Analyze",
    caption: "Understand & compare",
    icon: "Target",
  },
  {
    mode: "notices",
    name: "Coordinate",
    caption: "Review & agree",
    icon: "Radio",
  },
] as const;
export function JourneyRail() {
  const mode = useMission((s) => s.mode),
    ready = useMission((s) => s.missionReady),
    name = useMission((s) => s.missionName),
    organization = useMission((s) => s.organization);
  const index =
    mode === "setup"
      ? 0
      : ["operations", "simulation", "replay", "optimizer"].includes(mode)
        ? 1
        : 2;
  return (
    <nav className="journey-rail" aria-label="Mission journey">
      <div className="journey-rail-intro">
        <span>YOUR WORKSPACE</span>
        <strong>{organization?.name ?? "Mission control"}</strong>
      </div>
      <div className="journey-steps">
        {steps.map((step, i) => (
          <button
            key={step.mode}
            aria-label={step.name}
            aria-current={index === i ? "step" : undefined}
            disabled={i === 1 && !ready}
            className={index === i ? "active" : ""}
            onClick={() => useMission.getState().setMode(step.mode)}
          >
            <span className="step-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <b>{step.name}</b>
              <small>{step.caption}</small>
            </span>
            <Icon name={step.icon} size={18} />
          </button>
        ))}
      </div>
      <div className="journey-rail-summary">
        <span>CURRENT MISSION</span>
        <b>{name || "Not configured yet"}</b>
        <small>
          {ready
            ? "Working draft · editable"
            : "Start with a name and a vehicle"}
        </small>
      </div>
      <details className="journey-more">
        <summary>More tools</summary>
        {(
          [
            ["registry", "Shared infrastructure"],
            ["report", "Full report"],
            ["method", "Model & assumptions"],
            ["pricing", "Plans"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => useMission.getState().setMode(id)}>
            {label}
          </button>
        ))}
      </details>
      <div className="journey-rail-bottom">
        <Icon name="Globe2" size={16} />
        <span>
          Synthetic lunar terrain<small>30 × 30 km local frame</small>
        </span>
      </div>
    </nav>
  );
}
export function JourneyCanvas() {
  const mode = useMission((s) => s.mode),
    place = useMission((s) => s.placeMode),
    layers = useMission((s) => s.layers),
    preview = useMission((s) => s.preview),
    tour = useMission((s) => s.tour),
    reduced = useMission((s) => s.reducedMotion);
  return (
    <>
      <div className="journey-heading">
        <span>LUNAR LANDING COORDINATION</span>
        <h1>
          {mode === "setup"
            ? "Prepare your landing."
            : mode === "notices"
              ? "Reach a shared decision."
              : "Understand the impact."}
        </h1>
        <p>
          {place
            ? "Click the terrain to choose your touchdown point."
            : preview
              ? `${preview.label} · preview only, your draft is unchanged`
              : "Your choices drive the analysis."}
        </p>
      </div>
      <div className="journey-map-tools" aria-label="Map controls">
        <button
          aria-label="Overview"
          onClick={() => useMission.getState().focus("overview")}
        >
          <Icon name="Globe2" size={17} />
          Overview
        </button>
        <button
          aria-label="Focus landing"
          onClick={() => useMission.getState().focus("site")}
        >
          <Icon name="Target" size={17} />
          Landing
        </button>
        <button
          aria-label="Orbit camera"
          aria-pressed={tour}
          disabled={reduced || mode === "setup"}
          onClick={() => useMission.setState({ tour: !tour })}
        >
          <Icon name={tour ? "Pause" : "Play"} size={17} />
          Orbit
        </button>
        <details>
          <summary>Layers</summary>
          <div>
            {(["terrain", "infrastructure", "hazard"] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) =>
                    useMission.setState({
                      layers: { ...layers, [key]: e.target.checked },
                    })
                  }
                />
                {key === "hazard"
                  ? "Modeled exposure"
                  : key === "infrastructure"
                    ? "Infrastructure"
                    : "Terrain"}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="journey-map-caption">
        Drag to orbit · scroll to zoom
        <span>Illustrative geometry · calculated exposure</span>
      </div>
    </>
  );
}
function TerrainProfile() {
  const terrain = useMission((s) => s.terrain),
    site = useMission((s) => s.site),
    selected = useMission((s) => s.selectedAsset),
    assets = useMission((s) => s.assets);
  const asset = assets.find((a) => a.id === selected);
  if (!terrain || !asset) return null;
  const points = Array.from({ length: 48 }, (_, i) => {
    const f = i / 47;
    return (
      elevationAt(
        terrain,
        site.x + (asset.x - site.x) * f,
        site.y + (asset.y - site.y) * f,
      ) * 1000
    );
  });
  const lo = Math.min(...points) - 10,
    span = Math.max(...points) - lo + 10;
  const xy = points
    .map((z, i) => `${10 + (i / 47) * 300},${100 - ((z - lo) / span) * 75}`)
    .join(" ");
  return (
    <figure className="terrain-profile">
      <figcaption>Terrain between lander and asset</figcaption>
      <svg
        viewBox="0 0 320 120"
        role="img"
        aria-label="Terrain elevation profile"
      >
        <path
          d={`M10 110 L${xy.split(" ").join(" L")} L310 110 Z`}
          fill="#65d9ff16"
        />
        <polyline points={xy} fill="none" stroke="#65d9ff" strokeWidth="2" />
        <line
          x1="10"
          y1={100 - ((points[0] - lo) / span) * 75}
          x2="310"
          y2={100 - ((points[47] - lo) / span) * 75}
          stroke="#e9bd83"
          strokeDasharray="4 4"
        />
        <text x="10" y="119">
          Landing
        </text>
        <text x="310" y="119" textAnchor="end">
          Asset
        </text>
      </svg>
      <small>
        150 m visualization mesh. Dashed line is a visual reference, not a
        ballistic trajectory.
      </small>
    </figure>
  );
}
export function AnalysisWorkspace() {
  const analysisError = useMission((s) => s.error);
  const mode = useMission((s) => s.mode),
    assessment = useMission((s) => s.assessment),
    opt = useMission((s) => s.optimization),
    busy = useMission((s) => s.busy),
    assets = useMission((s) => s.assets),
    selected = useMission((s) => s.selectedAsset),
    brief = useMission((s) => s.brief),
    revision = useMission((s) => s.revision),
    preview = useMission((s) => s.preview);
  const [tab, setTab] = useState<"summary" | "compare" | "copilot" | "asset">(
    mode === "optimizer" ? "compare" : "summary",
  );
  const [candidateIndex, setCandidateIndex] = useState(0),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewError, setPreviewError] = useState("");
  const requestId = useRef(0);
  useEffect(() => {
    if (mode === "optimizer") setTab("compare");
  }, [mode]);
  useEffect(() => {
    if (selected) setTab("asset");
  }, [selected]);
  useEffect(() => {
    requestId.current++;
    setPreviewBusy(false);
    setPreviewError("");
  }, [revision]);
  useEffect(() => {
    return () => {
      requestId.current++;
      useMission.setState({ preview: null });
    };
  }, []);
  const rows = [...(assessment?.assets ?? [])].sort(
    (a, b) => b.expected_loss_meur - a.expected_loss_meur,
  );
  const result = rows.find((r) => r.asset_id === selected),
    asset = assets.find((a) => a.id === selected),
    worst = rows[0],
    worstAsset = assets.find((a) => a.id === worst?.asset_id);
  const candidates = useMemo(
    () =>
      opt
        ? [
            ...(opt.best
              ? [
                  {
                    ...opt.best.site,
                    expected_loss_meur: opt.best.summary.expected_loss_meur,
                    traverse_meur: opt.best_traverse_meur ?? 0,
                    total_cost_meur:
                      opt.best.summary.expected_loss_meur +
                      (opt.best_traverse_meur ?? 0),
                    distance_from_target_m: Math.hypot(
                      opt.best.site.x - opt.target.site.x,
                      opt.best.site.y - opt.target.site.y,
                    ),
                    worst_risk: opt.best.summary.worst_risk,
                  },
                ]
              : []),
            ...opt.alternatives,
          ]
        : [],
    [opt],
  );
  const candidate = candidates[Math.min(candidateIndex, candidates.length - 1)];
  async function inspect(site: Pt, label: string) {
    const id = ++requestId.current,
      s = useMission.getState(),
      capturedRevision = s.revision;
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const [a, f] = await Promise.all([
        api.assess(s.lander, site),
        api.footprint(s.lander, site),
      ]);
      if (
        id === requestId.current &&
        capturedRevision === useMission.getState().revision &&
        s.optimization === useMission.getState().optimization
      )
        useMission.setState({
          preview: { site, assessment: a, footprint: f, label },
        });
    } catch (e) {
      if (id === requestId.current) setPreviewError(String(e));
    } finally {
      if (id === requestId.current) setPreviewBusy(false);
    }
  }
  async function optimize() {
    useMission.setState({ preview: null });
    useMission.getState().setMode("optimizer");
    setTab("compare");
    setCandidateIndex(0);
    await useMission.getState().optimize();
  }
  const dominant = result
    ? Object.entries(result.mechanisms).sort((a, b) => b[1] - a[1])[0][0]
    : "";
  return (
    <aside
      className="journey-panel analysis-workspace"
      aria-label="Mission analysis"
    >
      <div className="journey-panel-head">
        <span>02 / ANALYZE</span>
        <h2>
          {tab === "asset" && asset
            ? asset.name
            : tab === "compare"
              ? "Compare your options."
              : tab === "copilot"
                ? "Make sense of the results."
                : "What needs your attention?"}
        </h2>
        <div className="journey-tabs" role="tablist">
          {(["summary", "compare", "copilot"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                requestId.current++;
                setPreviewBusy(false);
                setTab(t);
                useMission.setState({ preview: null });
              }}
            >
              {t === "summary"
                ? "Overview"
                : t === "compare"
                  ? "Compare"
                  : "Copilot"}
            </button>
          ))}
        </div>
      </div>
      <div className="journey-panel-body">
        {!assessment ? (
          <div className="journey-loading">
            {busy && <span className="spin" />}
            <h3>
              {analysisError
                ? "Analysis could not finish"
                : "Analyzing your configuration"}
            </h3>
            <p>
              {analysisError ||
                "Calculating asset exposure and the reference footprint."}
            </p>
            <button
              className="action-text"
              disabled={!!busy}
              onClick={() => void useMission.getState().analyze()}
            >
              Retry analysis
            </button>
          </div>
        ) : (
          <>
            {tab === "summary" && (
              <>
                <div
                  className="journey-verdict"
                  style={
                    {
                      "--severity": RISK_COLOR[assessment.summary.worst_risk],
                    } as CSSProperties
                  }
                >
                  <span>MODELED INFRASTRUCTURE LOSS</span>
                  <strong>
                    {fmtMeur(assessment.summary.expected_loss_meur)}
                  </strong>
                  <p>
                    {assessment.summary.assets_at_risk
                      ? `${assessment.summary.assets_at_risk} asset${assessment.summary.assets_at_risk === 1 ? "" : "s"} at elevated or critical exposure`
                      : "No asset at elevated or critical exposure in this model"}
                  </p>
                </div>
                <div className="guidance-card">
                  <Icon name="ShieldCheck" size={19} />
                  <p>
                    {worst && worst.expected_loss_meur > 0
                      ? `${worstAsset?.name ?? worst.asset_id} has the largest modeled loss. Inspect it or compare a different touchdown point.`
                      : "Review nearby infrastructure and coordinate your proposal before proceeding."}
                  </p>
                </div>
                <h3 className="section-caption">Infrastructure to review</h3>
                <div className="journey-asset-list">
                  {rows.slice(0, 4).map((r) => (
                    <button
                      key={r.asset_id}
                      onClick={() =>
                        useMission.getState().selectAsset(r.asset_id)
                      }
                    >
                      <span
                        className="severity-dot"
                        style={{ background: RISK_COLOR[r.risk] }}
                      />
                      <span>
                        <b>
                          {assets.find((a) => a.id === r.asset_id)?.name ??
                            r.asset_id}
                        </b>
                        <small>{fmtKm(r.distance_m)} from touchdown</small>
                      </span>
                      <strong>{fmtPct(r.damage_fraction)}</strong>
                      <Icon name="ArrowRight" size={15} />
                    </button>
                  ))}
                </div>
                <details className="journey-details">
                  <summary>Model and calculation details</summary>
                  <p>
                    Mean damage fraction, not failure probability.{" "}
                    {assessment.uncertainty?.valid_samples} valid position
                    samples · seed {assessment.uncertainty?.seed}.
                  </p>
                  <p>{assessment.provenance?.model_version}</p>
                  <p>
                    Synthetic terrain; illustrative engineering assumptions. Not
                    flight certification.
                  </p>
                </details>
              </>
            )}
            {tab === "asset" && result && asset && (
              <>
                <button
                  className="action-text"
                  onClick={() => {
                    setTab("summary");
                    useMission.getState().selectAsset(null);
                  }}
                >
                  ← Back to overview
                </button>
                <div
                  className="journey-verdict"
                  style={
                    { "--severity": RISK_COLOR[result.risk] } as CSSProperties
                  }
                >
                  <span>MEAN MODELED DAMAGE</span>
                  <strong>{fmtPct(result.damage_fraction)}</strong>
                  <p>
                    {fmtMeur(result.expected_loss_meur)} modeled loss ·{" "}
                    {fmtKm(result.distance_m)} away
                  </p>
                </div>
                <p className="plain-explanation">
                  {result.risk === "negligible"
                    ? "Exposure is very low under your current inputs."
                    : `The largest damage mechanism here is ${dominant === "impact" ? "coarse-particle impacts" : dominant === "coating" ? "fine-dust coating" : "surface erosion"}.`}{" "}
                  {result.shielded
                    ? "Nominal exposure is near zero; this does not guarantee shielding for all landing offsets."
                    : ""}
                </p>
                <TerrainProfile />
                <dl className="data-list">
                  <dt>Energy exposure</dt>
                  <dd>{result.energy_fluence_j_m2.toExponential(2)} J/m²</dd>
                  <dt>Fine dust</dt>
                  <dd>{result.dust_mass_g_m2.toPrecision(3)} g/m²</dd>
                  <dt>Sample q95 / worst</dt>
                  <dd>
                    {fmtPct(result.uncertainty?.q95 ?? result.damage_fraction)}{" "}
                    /{" "}
                    {fmtPct(
                      result.uncertainty?.worst_sample_damage ??
                        result.damage_fraction,
                    )}
                  </dd>
                </dl>
                <small className="muted">
                  Sample quantiles are not confidence intervals.
                </small>
              </>
            )}
            {tab === "compare" && (
              <>
                {!opt && (
                  <div className="journey-empty">
                    <Icon name="Target" size={34} />
                    <h3>Find a better balance.</h3>
                    <p>
                      Evaluate nearby sites against terrain, infrastructure
                      damage and relocation cost.
                    </p>
                  </div>
                )}
                <details className="journey-details">
                  <summary>Search preferences</summary>
                  {(
                    [
                      {
                        key: "searchRadius",
                        label: "Search radius",
                        min: 500,
                        max: 8000,
                        unit: "m",
                      },
                      {
                        key: "traverseCost",
                        label: "Relocation cost",
                        min: 0,
                        max: 50,
                        unit: "M€/km",
                      },
                      {
                        key: "maxSlope",
                        label: "Maximum slope",
                        min: 2,
                        max: 20,
                        unit: "°",
                      },
                      {
                        key: "clearance",
                        label: "Asset clearance",
                        min: 50,
                        max: 2000,
                        unit: "m",
                      },
                    ] as const
                  ).map((f) => (
                    <SearchParameter
                      key={f.key}
                      field={f.key}
                      label={f.label}
                      min={f.min}
                      max={f.max}
                      unit={f.unit}
                    />
                  ))}
                </details>
                <button
                  className="action-primary full"
                  disabled={!!busy || previewBusy}
                  onClick={() => void optimize()}
                >
                  {busy === "optimizer"
                    ? "Evaluating sites…"
                    : opt
                      ? "Recalculate alternatives"
                      : "Find alternative sites"}
                  <Icon name="Sparkles" size={17} />
                </button>
                {opt && !candidate && (
                  <p>
                    No feasible alternative was found. Adjust your search
                    constraints.
                  </p>
                )}
                {opt && candidate && (
                  <>
                    <label className="form-label">
                      COMPARE WITH
                      <select
                        aria-label="Alternative site"
                        value={candidateIndex}
                        onChange={(e) => {
                          requestId.current++;
                          setPreviewBusy(false);
                          setCandidateIndex(Number(e.target.value));
                          useMission.setState({ preview: null });
                        }}
                      >
                        {candidates.map((c, i) => (
                          <option key={i} value={i}>
                            {i === 0
                              ? "Best evaluated site"
                              : `Alternative ${i}`}{" "}
                            · {fmtMeur(c.total_cost_meur)} total
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="comparison-cards">
                      <div>
                        <span>ORIGINAL</span>
                        <strong>
                          {fmtMeur(opt.target.summary.expected_loss_meur)}
                        </strong>
                        <small>modeled damage loss</small>
                      </div>
                      <div className="recommended">
                        <span>ALTERNATIVE</span>
                        <strong>{fmtMeur(candidate.expected_loss_meur)}</strong>
                        <small>modeled damage loss</small>
                      </div>
                    </div>
                    <dl className="data-list">
                      <dt>Relocation</dt>
                      <dd>{fmtKm(candidate.distance_from_target_m)}</dd>
                      <dt>Relocation cost</dt>
                      <dd>{fmtMeur(candidate.traverse_meur)}</dd>
                      <dt>Total objective</dt>
                      <dd>{fmtMeur(candidate.total_cost_meur)}</dd>
                      <dt>Terrain slope</dt>
                      <dd>{candidate.slope_deg.toFixed(1)}°</dd>
                    </dl>
                    <div
                      className="preview-switch"
                      aria-label="Compare map previews"
                    >
                      <button
                        disabled={previewBusy || !!busy}
                        aria-pressed={preview?.label === "Original site"}
                        onClick={() =>
                          void inspect(opt.target.site, "Original site")
                        }
                      >
                        Before
                      </button>
                      <button
                        disabled={previewBusy || !!busy}
                        aria-pressed={preview?.label === "Alternative site"}
                        onClick={() =>
                          void inspect(
                            { x: candidate.x, y: candidate.y },
                            "Alternative site",
                          )
                        }
                      >
                        After
                      </button>
                    </div>
                    <p className="panel-note">
                      {previewBusy
                        ? "Updating the calculated map…"
                        : preview
                          ? `${preview.label} is on the map. Your draft is unchanged until you adopt it.`
                          : "Preview both footprints with the same camera. Then choose whether to move."}
                    </p>
                    {previewError && (
                      <p role="alert" className="inline-error">
                        {previewError}
                      </p>
                    )}
                    <button
                      className="outline-button full"
                      disabled={!!busy || previewBusy}
                      onClick={() => {
                        useMission
                          .getState()
                          .moveSite({ x: candidate.x, y: candidate.y }, true);
                        setTab("summary");
                        useMission.getState().focus("site");
                      }}
                    >
                      Use this landing site <Icon name="Check" size={17} />
                    </button>
                    <small className="muted">
                      Best evaluated objective; no global optimum or safety
                      guarantee.
                    </small>
                  </>
                )}
              </>
            )}
            {tab === "copilot" && (
              <>
                <div className="guidance-card">
                  <Icon name="Sparkles" size={21} />
                  <p>
                    {worst
                      ? `${worstAsset?.name ?? worst.asset_id} contributes ${fmtMeur(worst.expected_loss_meur)} to modeled loss. Compare alternative sites or inspect its exposure before filing.`
                      : "Review the assessment before filing your proposal."}
                  </p>
                </div>
                <div className="copilot-prompts">
                  <button
                    onClick={() => {
                      if (worst)
                        useMission.getState().selectAsset(worst.asset_id);
                    }}
                  >
                    Why is this asset affected?
                  </button>
                  <button onClick={() => void optimize()}>
                    What can I change?
                  </button>
                </div>
                <p>
                  Generate a mission briefing from the current numerical
                  assessment.
                </p>
                <button
                  className="outline-button full"
                  disabled={!!busy}
                  onClick={() => void useMission.getState().generateBrief()}
                >
                  {busy === "brief"
                    ? "Preparing explanation…"
                    : "Generate contextual briefing"}
                </button>
                {brief && (
                  <>
                    <span className="brief-source">
                      {brief.source === "claude"
                        ? `AI narrative · ${brief.model}`
                        : "Offline model-based explanation · deterministic template"}
                    </span>
                    <Markdown text={brief.markdown} />
                  </>
                )}
                <p className="panel-note">
                  Narrative explains the computed results; it does not certify
                  safety or replace the model.
                </p>
              </>
            )}
          </>
        )}
      </div>
      <div className="journey-panel-foot">
        {tab === "summary" || tab === "asset" ? (
          <button
            className="action-primary full"
            disabled={!assessment || !!busy}
            onClick={() => void optimize()}
          >
            Compare landing sites <Icon name="ArrowRight" size={17} />
          </button>
        ) : null}
        <button
          className={
            tab === "summary" || tab === "asset"
              ? "action-text full"
              : "action-primary full"
          }
          disabled={!assessment || !!busy || previewBusy}
          onClick={() => useMission.getState().setMode("notices")}
        >
          Continue to coordination <Icon name="ArrowRight" size={17} />
        </button>
      </div>
    </aside>
  );
}
function SearchParameter({
  field,
  label,
  min,
  max,
  unit,
}: {
  field: "searchRadius" | "traverseCost" | "maxSlope" | "clearance";
  label: string;
  min: number;
  max: number;
  unit: string;
}) {
  const value = useMission((s) => s[field]),
    busy = useMission((s) => s.busy);
  return (
    <label className="form-label">
      {label} / {unit}
      <NumericInput
        label={label}
        value={value}
        min={min}
        max={max}
        step={field === "traverseCost" ? 0.5 : 1}
        disabled={!!busy}
        onCommit={(v) =>
          useMission.setState({ [field]: v, optimization: null, preview: null })
        }
      />
    </label>
  );
}
export function CoordinationWorkspace() {
  const plans = useMission((s) => s.plans),
    notices = useMission((s) => s.notices),
    acting = useMission((s) => s.actingId),
    operators = useMission((s) => s.operators),
    session = useMission((s) => s.session),
    busy = useMission((s) => s.busy),
    assessment = useMission((s) => s.assessment),
    name = useMission((s) => s.missionName),
    windowText = useMission((s) => s.window),
    editing = useMission((s) => s.editingPlanId),
    editingRevision = useMission((s) => s.editingRevision),
    coordinationError = useMission((s) => s.coordinationError);
  const [selected, setSelected] = useState(""),
    [noticeId, setNoticeId] = useState(""),
    [reply, setReply] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  const current = notices.filter(
    (n) =>
      n.plan_id === plan?.id && (n.revision ?? 1) === (plan?.revision ?? 1),
  );
  const notice = current.find((n) => n.id === noticeId) ?? current[0];
  useEffect(() => {
    setSelected("");
    setNoticeId("");
    setReply("");
    setError("");
  }, [acting]);
  useEffect(() => {
    if (notice?.to_operator_id === acting && !notice.read_at)
      void api
        .readNotice(notice.id)
        .then(() => useMission.getState().refresh())
        .catch((e) => setError(String(e)));
  }, [notice?.id, acting]);
  async function respond(status: "acknowledged" | "objection") {
    if (!notice) return;
    setPending(true);
    setError("");
    try {
      await api.updateNotice(notice.id, status, reply.trim() || undefined);
      await useMission.getState().refresh();
      setReply("");
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  }
  async function file() {
    const id = await useMission.getState().filePlan();
    if (id) {
      setSelected(id);
      setNoticeId("");
    }
  }
  function revise() {
    if (!plan) return;
    const s = useMission.getState();
    s.updateLander(plan.lander);
    s.moveSite(plan.site);
    useMission.setState({
      missionReady: true,
      missionName: plan.name,
      window: plan.window,
      editingPlanId: plan.id,
      editingRevision: plan.revision ?? 1,
    });
    s.setMode("optimizer");
  }
  const dates = windowText.split(" / ");
  const start = dates[0]?.slice(0, 16) ?? "",
    end = dates[1]?.slice(0, 16) ?? "";
  function changeWindow(a: string, b: string) {
    useMission.setState({ window: `${a}:00Z / ${b}:00Z` });
  }
  const acknowledged = current.filter(
    (n) => n.status === "acknowledged",
  ).length;
  return (
    <aside
      className="journey-panel coordination-workspace"
      aria-label="Mission coordination"
    >
      <div className="journey-panel-head">
        <span>03 / COORDINATE</span>
        <h2>Keep everyone in the loop.</h2>
        <p>
          File your proposal, review concerns, and agree on the current
          revision.
        </p>
      </div>
      <div className="journey-panel-body">
        {session?.permissions.includes("plans:write") && (
          <details
            className="journey-details"
            open={!plans.length || !!editing}
          >
            <summary>
              {editing
                ? `File revision ${(editingRevision ?? 1) + 1}`
                : "File your current draft"}
            </summary>
            <p>
              {name} ·{" "}
              {assessment
                ? fmtMeur(assessment.summary.expected_loss_meur) +
                  " modeled loss"
                : "An assessment is required"}
            </p>
            <label className="form-label">
              Window start / UTC
              <input
                aria-label="Window start UTC"
                type="datetime-local"
                value={start}
                onChange={(e) => changeWindow(e.target.value, end)}
              />
            </label>
            <label className="form-label">
              Window end / UTC
              <input
                aria-label="Window end UTC"
                type="datetime-local"
                value={end}
                onChange={(e) => changeWindow(start, e.target.value)}
              />
            </label>
            <button
              className="action-primary full"
              disabled={!assessment || !!busy || !name.trim() || !start || !end}
              onClick={() => void file()}
            >
              {busy === "submit"
                ? "Filing…"
                : editing
                  ? "Submit revision"
                  : "Submit proposal"}
              <Icon name="Radio" size={16} />
            </button>
            {editing && (
              <button
                className="action-text full"
                onClick={() =>
                  useMission.setState({
                    editingPlanId: null,
                    editingRevision: null,
                  })
                }
              >
                File as a separate proposal instead
              </button>
            )}
          </details>
        )}
        {(error || coordinationError) && (
          <p className="inline-error" role="alert">
            {error || coordinationError}
          </p>
        )}
        {plans.length > 0 ? (
          <>
            <label className="form-label">
              PROPOSAL
              <select
                aria-label="Proposal to review"
                value={plan?.id ?? ""}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setNoticeId("");
                  setReply("");
                }}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · r{p.revision ?? 1}
                  </option>
                ))}
              </select>
            </label>
            <div className="coordination-status-card">
              <span className="panel-subtitle">
                CURRENT REVISION / {plan?.revision ?? 1}
              </span>
              <h3 className="coordination-status">
                {plan?.status.split("_").join(" ")}
              </h3>
              <p>
                {acknowledged} of {current.length} visible recipients
                acknowledged
              </p>
            </div>
            <ol className="journey-status-track">
              <li className="complete">Proposal filed</li>
              <li className={current.length ? "complete" : ""}>
                Consultations created
              </li>
              <li
                className={
                  current.some((n) => n.status === "objection")
                    ? "needs-attention"
                    : acknowledged
                      ? "complete"
                      : ""
                }
              >
                {current.some((n) => n.status === "objection")
                  ? "Concern raised — revision or review needed"
                  : "Current revision under review"}
              </li>
              <li className={plan?.status === "coordinated" ? "complete" : ""}>
                {plan?.status === "coordinated"
                  ? "Coordinated"
                  : "Waiting for explicit acknowledgements"}
              </li>
            </ol>
            {!current.length && (
              <p className="panel-note">
                No current consultation is visible to your organization. Filing
                without recipients is not safety approval.
              </p>
            )}
            {notice && (
              <>
                <label className="form-label">
                  CONSULTATION
                  <select
                    aria-label="Consultation to review"
                    value={notice.id}
                    onChange={(e) => {
                      setNoticeId(e.target.value);
                      setReply("");
                    }}
                  >
                    {current.map((n) => (
                      <option key={n.id} value={n.id}>
                        {operators.find((o) => o.id === n.to_operator_id)
                          ?.name ?? n.to_operator_id}{" "}
                        · {n.status}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="notice-summary">{notice.subject}</p>
                <details className="journey-details">
                  <summary>Read the consultation</summary>
                  <p className="notice-evidence">{notice.body}</p>
                </details>
                {notice.reply && <blockquote>{notice.reply}</blockquote>}
                {notice.to_operator_id === acting &&
                  session?.permissions.includes("notices:respond") && (
                    <>
                      <label className="form-label">
                        YOUR RESPONSE
                        <textarea
                          aria-label="Consultation response"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          maxLength={1000}
                          placeholder="Describe your concern, or add a comment…"
                        />
                      </label>
                      <div className="response-actions">
                        <button
                          className="outline-button"
                          disabled={pending || plan?.status === "withdrawn"}
                          onClick={() => void respond("acknowledged")}
                        >
                          Acknowledge
                        </button>
                        <button
                          className="outline-button danger"
                          disabled={
                            pending ||
                            !reply.trim() ||
                            plan?.status === "withdrawn"
                          }
                          onClick={() => void respond("objection")}
                        >
                          Raise a concern
                        </button>
                      </div>
                    </>
                  )}
              </>
            )}
            {plan?.operator_id === acting && plan.status !== "withdrawn" && (
              <button className="outline-button full" onClick={revise}>
                Compare a revision <Icon name="ArrowRight" size={16} />
              </button>
            )}
            {plan && (
              <details className="journey-details">
                <summary>Revision history & evidence</summary>
                <PlanHistory planId={plan.id} />
              </details>
            )}
          </>
        ) : (
          <div className="journey-empty">
            <Icon name="Radio" size={32} />
            <h3>No proposal yet.</h3>
            <p>
              Submit your analyzed draft to create consultations for affected
              operators. They will appear here when persisted.
            </p>
          </div>
        )}
        <p className="panel-note">
          In-app coordination only. Acknowledgement is not scientific safety
          certification.
        </p>
      </div>
      <div className="journey-panel-foot">
        <button
          className="action-text full"
          onClick={() => useMission.getState().setMode("report")}
        >
          Open full report / PDF <Icon name="FileText" size={16} />
        </button>
      </div>
    </aside>
  );
}
