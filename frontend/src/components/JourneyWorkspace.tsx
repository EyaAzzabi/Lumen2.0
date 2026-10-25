import MissionLibrary, { DraftSaveControl } from "./MissionLibrary";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { api, fmtKm, fmtMeur, fmtPct, RISK_COLOR, type Pt, type ConstraintEvaluation } from "../api";
import { useMission, elevationAt } from "../mission";
import { Icon } from "./Icon";
import { Markdown, Term } from "../ui";
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
    organization = useMission((s) => s.organization),
    assessed = useMission((s) => !!s.assessment),
    filed = useMission((s) =>
      s.plans.some((p) => p.operator_id === s.actingId),
    );
  const done = [ready, assessed, filed];
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
            className={`${index === i ? "active" : ""} ${done[i] ? "done" : ""}`}
            onClick={() => useMission.getState().setMode(step.mode)}
          >
            <span className="step-number">
              {done[i] && index !== i ? (
                <Icon name="Check" size={14} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <span>
              <b>{step.name}</b>
              <small>{step.caption}</small>
            </span>
            <Icon name={step.icon} size={18} />
          </button>
        ))}
      </div>
      <Onboarding />
      <MissionLibrary />
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
/** First-run checklist for organizations that are not set up yet. */
function Onboarding() {
  const user = useMission((s) => s.user),
    org = useMission((s) => s.organization),
    ownAssets = useMission((s) =>
      s.assets.some((a) => a.operator_id === s.actingId),
    ),
    assessed = useMission((s) => !!s.assessment);
  const key = `plume.onboarding.${org?.id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === "done";
    } catch {
      return false;
    }
  });
  const [team, setTeam] = useState<number | null>(null);
  useEffect(() => {
    if (user && !user.demo)
      api
        .members()
        .then((m) => setTeam(m.length))
        .catch(() => setTeam(null));
  }, [user, org?.id]);
  if (!user || user.demo || !org || hidden) return null;
  const items: [boolean, string, () => void][] = [
    [
      ownAssets,
      "Register your first asset",
      () => {
        useMission.setState({ pickingAsset: true });
        useMission.getState().setMode("registry");
      },
    ],
    [
      (team ?? 0) > 1,
      org.invite_code
        ? `Invite a teammate · code ${org.invite_code}`
        : "Invite a teammate",
      () => {
        if (org.invite_code) {
          void navigator.clipboard?.writeText(org.invite_code);
          useMission
            .getState()
            .notify(
              `Invite code ${org.invite_code} copied. Share it with a teammate.`,
            );
        }
      },
    ],
    [
      assessed,
      "Run your first assessment",
      () => useMission.getState().setMode("setup"),
    ],
  ];
  const complete = items.filter((i) => i[0]).length;
  return (
    <div className="onboarding">
      <div className="onboarding-head">
        <b>Get started</b>
        <small>{complete} / 3</small>
        <button
          className="icon-button"
          aria-label="Hide checklist"
          onClick={() => {
            try {
              localStorage.setItem(key, "done");
            } catch {
              /* session-only */
            }
            setHidden(true);
          }}
        >
          <Icon name="X" size={13} />
        </button>
      </div>
      {items.map(([ok, label, run], i) => (
        <button key={i} className={ok ? "ok" : ""} disabled={ok} onClick={run}>
          <span>{ok ? <Icon name="Check" size={12} /> : i + 1}</span>
          {label}
        </button>
      ))}
    </div>
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
  const effect = (r: NonNullable<typeof worst>, name: string) => {
    const m = Object.entries(r.mechanisms).sort((a, b) => b[1] - a[1])[0][0];
    return m === "impact"
      ? `pelt ${name} with gravel`
      : m === "coating"
        ? `coat ${name} in dust`
        : `sandblast ${name}`;
  };
  const verdictSentence =
    worst && worst.risk !== "negligible"
      ? `This landing would ${effect(worst, worstAsset?.name ?? worst.asset_id)} (${fmtPct(worst.damage_fraction)} damage, ${fmtMeur(worst.expected_loss_meur)}).`
      : "No registered asset reaches elevated exposure at this touchdown point.";
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
                `Simulating 4 grain classes over 48 touchdown samples for ${assets.length} registered assets, then a 96 × 96 footprint (9,216 map points).`}
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
                  <span>
                    <Term tip="Expected damage to all registered assets, in euros, from the physics model.">
                      MODELED INFRASTRUCTURE LOSS
                    </Term>
                  </span>
                  <strong>
                    {fmtMeur(assessment.summary.expected_loss_meur)}
                  </strong>
                  <p className="verdict-sentence">{verdictSentence}</p>
                  <SourceLine />
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
                  <span>
                    <Term tip="Average fraction of the asset's value lost, over all possible touchdown points. Not a failure probability.">
                      MEAN MODELED DAMAGE
                    </Term>
                  </span>
                  <strong>{fmtPct(result.damage_fraction)}</strong>
                  <p>
                    {fmtMeur(result.expected_loss_meur)} modeled loss ·{" "}
                    {fmtKm(result.distance_m)} away
                  </p>
                  <SourceLine />
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
                  <dt>
                    <Term>Energy exposure</Term>
                  </dt>
                  <dd>{result.energy_fluence_j_m2.toExponential(2)} J/m²</dd>
                  <dt>
                    <Term>Fine dust</Term>
                  </dt>
                  <dd>{result.dust_mass_g_m2.toPrecision(3)} g/m²</dd>
                  <dt>
                    <Term>Sample q95 / worst</Term>
                  </dt>
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
                    ? "Screening ≈1,800 candidate sites…"
                    : opt
                      ? "Recalculate alternatives"
                      : "Find alternative sites"}
                  <Icon name="Sparkles" size={17} />
                </button>
                {busy === "optimizer" && (
                  <p className="panel-note" role="status">
                    Checking slope and clearance at every candidate, scoring
                    damage to all registered assets, then re-scoring the best 8
                    over 48 touchdown samples.
                  </p>
                )}
                {opt && !candidate && (
                  <p>
                    No feasible site found in the evaluated search. This does not
                    establish global impossibility. Adjust your search constraints.
                  </p>
                )}
                {opt && <>
                  <ConstraintChecks evaluation={opt.baseline_constraint_evaluation} title="Initial site constraints" />
                  {opt.near_misses?.length > 0 && <details className="journey-details"><summary>Rejected candidates ({opt.near_misses.length})</summary>
                    {opt.near_misses.map((c, i) => <div key={i}><p>Rejected · E {c.x.toFixed(1)} / N {c.y.toFixed(1)} m</p><ConstraintChecks evaluation={c.constraint_evaluation} title="Unmet limits" /></div>)}
                  </details>}
                </>}
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
                    <p className="comparison-headline">
                      {opt.target.summary.expected_loss_meur > 0
                        ? `Moving ${fmtKm(candidate.distance_from_target_m)} cuts modeled damage to neighbours by ${Math.round((1 - candidate.expected_loss_meur / opt.target.summary.expected_loss_meur) * 100)}%.`
                        : "The requested site already has no modeled damage."}
                    </p>
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
                    <p className="source-line">
                      Optimizer · {opt.search.candidates.toLocaleString()} sites
                      screened · {opt.search.feasible.toLocaleString()} feasible
                      · {(opt.compute_ms / 1000).toFixed(1)} s
                      <LimitsBadge />
                    </p>
                    <dl className="data-list">
                      <dt>
                        <Term>Relocation</Term>
                      </dt>
                      <dd>{fmtKm(candidate.distance_from_target_m)}</dd>
                      <dt>
                        <Term>Relocation cost</Term>
                      </dt>
                      <dd>{fmtMeur(candidate.traverse_meur)}</dd>
                      <dt>
                        <Term>Total objective</Term>
                      </dt>
                      <dd>{fmtMeur(candidate.total_cost_meur)}</dd>
                      <dt>
                        <Term>Terrain slope</Term>
                      </dt>
                      <dd>{candidate.slope_deg.toFixed(1)}°</dd>
                    </dl>
                    <p className="panel-note">Candidate: E {candidate.x.toFixed(1)} / N {candidate.y.toFixed(1)} m. Modeled loss difference: {fmtMeur(candidate.expected_loss_meur - opt.target.summary.expected_loss_meur)}.</p>
                    <ConstraintChecks evaluation={candidateIndex === 0 ? opt.best_explanation?.constraint_evaluation : opt.alternatives[candidateIndex - 1]?.constraint_evaluation} title="Candidate constraints" />
                    <details className="journey-details"><summary>Damage differences by equipment</summary>
                      {(candidateIndex === 0 ? opt.best?.assets : opt.alternatives[candidateIndex - 1]?.assets)?.map(r => {
                        const before = opt.target.assets.find(a => a.asset_id === r.asset_id);
                        return <p className="panel-note" key={r.asset_id}>{assets.find(a => a.id === r.asset_id)?.name ?? r.asset_id}: {before ? fmtPct(before.damage_fraction) : "unknown"} → {fmtPct(r.damage_fraction)} mean modeled damage</p>;
                      })}
                    </details>
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
                          .adoptSite(
                            { x: candidate.x, y: candidate.y },
                            candidateIndex === 0
                              ? "Best evaluated site"
                              : `Alternative ${candidateIndex}`,
                          );
                        setTab("summary");
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
                        ? `AI explanation (${brief.model}) · figures come from the physics engine`
                        : "Template explanation (offline) · figures come from the physics engine"}
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
        <DraftSaveControl />
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
  const [selected, setSelected] = useState(
      () => useMission.getState().focusPlanId ?? "",
    ),
    [noticeId, setNoticeId] = useState(""),
    [reply, setReply] = useState(""),
    [constraintAsset, setConstraintAsset] = useState(""),
    [reason, setReason] = useState(""),
    [maximum, setMaximum] = useState(""),
    [minimum, setMinimum] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  const current = notices.filter(
    (n) =>
      n.plan_id === plan?.id && (n.revision ?? 1) === (plan?.revision ?? 1),
  );
  const notice = current.find((n) => n.id === noticeId) ?? current[0];
  const focusPlanId = useMission((s) => s.focusPlanId);
  useEffect(() => {
    if (focusPlanId) {
      setSelected(focusPlanId);
      setNoticeId("");
      useMission.setState({ focusPlanId: null });
    }
  }, [focusPlanId]);
  useEffect(() => {
    if (notice?.to_operator_id === acting && !notice.read_at)
      void api
        .readNotice(notice.id)
        .then(() => useMission.getState().refresh())
        .catch((e) => setError(String(e)));
  }, [notice?.id, acting]);
  const registryAssets = useMission((s) => s.assets);
  useEffect(() => {
    setConstraintAsset(""); setReason(""); setMaximum(""); setMinimum(""); setReply("");
  }, [notice?.id, acting]);
  async function respond(status: "acknowledged" | "objection") {
    if (!notice) return;
    setPending(true);
    setError("");
    try {
      await api.updateNotice(notice.id, status, reply.trim() || reason.trim() || undefined,
        status === "objection" && constraintAsset ? [{
          asset_id: constraintAsset, reason: reason.trim(),
          max_damage_fraction: maximum === "" ? null : Number(maximum) / 100,
          min_separation_m: minimum === "" ? null : Number(minimum),
        }] : []);
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
      draftId: null,
      draftVersion: 0,
      draftFingerprint: "",
      draftStatus: "local",
      draftError: null,
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
                {(notice.constraints ?? []).map((c, i) => <p className="panel-note" key={i}>
                  {registryAssets.find(a => a.id === c.asset_id)?.name ?? c.asset_id}: {c.reason}
                  {c.max_damage_fraction != null && ` · maximum mean modeled damage ${fmtPct(c.max_damage_fraction)}`}
                  {c.min_separation_m != null && ` · minimum landing distance ${c.min_separation_m} m`}
                </p>)}
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
                      <details className="journey-details">
                        <summary>Structured objection</summary>
                        <label className="form-label">Equipment
                          <select aria-label="Objection equipment" value={constraintAsset} onChange={e => setConstraintAsset(e.target.value)}>
                            <option value="">Text-only concern</option>
                            {registryAssets.filter(a => a.operator_id === acting && notice.asset_ids.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </label>
                        {constraintAsset && <>
                          <label className="form-label">Required reason<input aria-label="Objection reason" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
                          <label className="form-label">Maximum mean modeled damage / % (optional)<input aria-label="Maximum modeled damage percent" type="number" min="0" max="100" step="any" value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
                          <label className="form-label">Minimum landing distance / m (optional)<input aria-label="Minimum landing distance metres" type="number" min="0" max="30000" step="any" value={minimum} onChange={e => setMinimum(e.target.value)} /></label>
                          <p className="panel-note">Negotiated model limits, not certified safety limits. The response above provides additional explanation.</p>
                        </>}
                      </details>
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
                            (!reply.trim() && !reason.trim()) ||
                            (!!constraintAsset && (reason.trim().length < 2 ||
                              (maximum !== "" && (!Number.isFinite(Number(maximum)) || Number(maximum) < 0 || Number(maximum) > 100)) ||
                              (minimum !== "" && (!Number.isFinite(Number(minimum)) || Number(minimum) < 0 || Number(minimum) > 30000)))) ||
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
              <details className="journey-details" open>
                <summary>Activity & revision history</summary>
                <PlanHistory planId={plan.id} />
              </details>
            )}
          </>
        ) : (
          <div className="journey-empty">
            <Icon name="Radio" size={32} />
            <h3>No proposal yet.</h3>
            <p>
              {assessment
                ? "Submit your analyzed draft above: every operator whose assets are at risk is notified automatically."
                : "Analyze a mission first, then file it here. Proposals from other operators that affect your assets also appear here."}
            </p>
            {!assessment && (
              <button
                className="outline-button full"
                onClick={() => useMission.getState().setMode("setup")}
              >
                Prepare a mission <Icon name="ArrowRight" size={15} />
              </button>
            )}
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

/** Where a number comes from, shown under every headline figure. */
function SourceLine() {
  const assessment = useMission((s) => s.assessment);
  if (!assessment) return null;
  return (
    <p className="source-line">
      Physics engine · {assessment.compute_ms.toFixed(0)} ms · averaged over{" "}
      {assessment.uncertainty?.valid_samples ?? 48} touchdown samples
      <LimitsBadge />
    </p>
  );
}

function LimitsBadge() {
  return (
    <button
      className="limits-badge"
      title="Simplified, experimentally uncalibrated ballistic model on synthetic terrain. Open the method page."
      onClick={() => useMission.getState().setMode("method")}
    >
      Simplified model · not flight-certified
    </button>
  );
}

function ConstraintChecks({ evaluation, title }: { evaluation?: ConstraintEvaluation; title: string }) {
  if (!evaluation?.checks.length) return null;
  return <section aria-label={title}><h3 className="section-caption">{title}</h3>
    {evaluation.checks.map((c, i) => <p className="panel-note" key={i}>
      {c.satisfied ? "Satisfied" : "Not satisfied"} · {c.asset_id} · {c.reason}
      {c.max_damage_fraction != null && ` · mean damage ${c.actual_damage_fraction == null ? "unknown" : fmtPct(c.actual_damage_fraction)} / maximum ${fmtPct(c.max_damage_fraction)}`}
      {c.min_separation_m != null && ` · distance ${c.actual_distance_m?.toFixed(1) ?? "unknown"} / minimum ${c.min_separation_m} m`}
    </p>)}
  </section>;
}
