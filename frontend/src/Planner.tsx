import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView";
import type {
  Asset, Assessment, Brief, Footprint, LanderParams, Meta, Operator, Optimization, Pt,
} from "./api";
import { RISK_COLOR, api, fmtKm, fmtMeur, fmtPct } from "./api";
import { Markdown, RiskChip, Spinner } from "./ui";

interface Props {
  meta: Meta;
  assets: Asset[];
  operators: Operator[];
  actingId: string;
  onSubmitted: (msg: string) => void;
}

const DEFAULT_SITE: Pt = { x: 1500, y: -1500 };

export default function Planner({ meta, assets, operators, actingId, onSubmitted }: Props) {
  const [presetId, setPresetId] = useState("superheavy");
  const preset = meta.landers.find((l) => l.id === presetId)!;
  const [lander, setLander] = useState<LanderParams>({
    label: preset.label, thrust_kn: preset.thrust_kn, hover_s: preset.hover_s, dispersion_m: preset.dispersion_m,
  });
  const [site, setSite] = useState<Pt>(DEFAULT_SITE);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const [busy, setBusy] = useState({ assess: false, footprint: false, optimize: false, brief: false, submit: false });
  const [opt, setOpt] = useState<Optimization | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState(4000);
  const [traverseCost, setTraverseCost] = useState(2);
  const [planName, setPlanName] = useState("KLL Cargo-7");
  const [windowStr, setWindowStr] = useState("2031-03-14 06:00–08:00 UTC");
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const opById = useMemo(() => new Map(operators.map((o) => [o.id, o])), [operators]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  function choosePreset(id: string) {
    const p = meta.landers.find((l) => l.id === id)!;
    setPresetId(id);
    setLander({ label: p.label, thrust_kn: p.thrust_kn, hover_s: p.hover_s, dispersion_m: p.dispersion_m });
  }

  // Re-assess whenever the plan changes; drop stale responses.
  useEffect(() => {
    const id = ++reqId.current;
    setOpt(null);
    setBrief(null);
    setError(null);
    setBusy((b) => ({ ...b, assess: true, footprint: true }));
    const t = setTimeout(() => {
      api.assess(lander, site)
        .then((a) => { if (id === reqId.current) setAssessment(a); })
        .catch((e) => id === reqId.current && setError(String(e)))
        .finally(() => id === reqId.current && setBusy((b) => ({ ...b, assess: false })));
      api.footprint(lander, site)
        .then((f) => { if (id === reqId.current) setFootprint(f); })
        .catch((e) => id === reqId.current && setError(String(e)))
        .finally(() => id === reqId.current && setBusy((b) => ({ ...b, footprint: false })));
    }, 180);
    return () => clearTimeout(t);
  }, [lander, site, assets]);

  async function runOptimize() {
    setBusy((b) => ({ ...b, optimize: true }));
    setBrief(null);
    try {
      const o = await api.optimize(lander, site, { search_radius_m: searchRadius, traverse_meur_per_km: traverseCost });
      setOpt(o);
      setShowSearch(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy((b) => ({ ...b, optimize: false }));
    }
  }

  function adoptOptimized() {
    if (!opt?.best) return;
    setSite({ x: opt.best.site.x, y: opt.best.site.y });
  }

  async function runBrief() {
    setBusy((b) => ({ ...b, brief: true }));
    try {
      setBrief(await api.brief(lander, site, opt?.best ? { x: opt.best.site.x, y: opt.best.site.y } : null));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy((b) => ({ ...b, brief: false }));
    }
  }

  async function submit() {
    setBusy((b) => ({ ...b, submit: true }));
    try {
      const r = await api.submitPlan({ lander, site, operator_id: actingId, name: planName, window: windowStr });
      onSubmitted(r.notices_sent
        ? `${r.plan.id} filed · consultation notices sent to ${r.notices_sent} operator${r.notices_sent > 1 ? "s" : ""}`
        : `${r.plan.id} filed · no neighbour above negligible risk, cleared`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy((b) => ({ ...b, submit: false }));
    }
  }

  const sortedResults = useMemo(
    () => (assessment ? [...assessment.assets].sort((a, b) => b.expected_loss_meur - a.expected_loss_meur) : []),
    [assessment],
  );
  const s = assessment?.summary;
  const best = opt?.best;
  const reduction = opt && best && opt.target.summary.expected_loss_meur > 0
    ? 1 - best.summary.expected_loss_meur / opt.target.summary.expected_loss_meur : 0;

  return (
    <div className="planner">
      {/* ---------------- left: plan ---------------- */}
      <aside className="side left">
        <div className="card">
          <h3>1 · Lander</h3>
          <div className="preset-grid">
            {meta.landers.map((l) => (
              <button key={l.id} className={`preset ${presetId === l.id ? "active" : ""}`} onClick={() => choosePreset(l.id)}>
                <span className="name">{l.label}</span>
                <span className="spec">{l.thrust_kn.toLocaleString()} kN · {l.hover_s}s hover · ±{l.dispersion_m} m</span>
              </button>
            ))}
          </div>
          <div className="field">
            <label>Engine thrust <b>{lander.thrust_kn.toLocaleString()} kN</b></label>
            <input type="range" min={0} max={1} step={0.001}
              value={Math.log(lander.thrust_kn / 2) / Math.log(2500 / 2)}
              onChange={(e) => setLander({ ...lander, label: "Custom lander", thrust_kn: Math.round(2 * Math.pow(2500 / 2, +e.target.value)) })} />
          </div>
          <div className="field">
            <label>Low-altitude hover <b>{lander.hover_s} s</b></label>
            <input type="range" min={5} max={120} step={1} value={lander.hover_s}
              onChange={(e) => setLander({ ...lander, label: "Custom lander", hover_s: +e.target.value })} />
          </div>
          <div className="field">
            <label>Landing dispersion (1σ) <b>{lander.dispersion_m} m</b></label>
            <input type="range" min={0} max={500} step={10} value={lander.dispersion_m}
              onChange={(e) => setLander({ ...lander, dispersion_m: +e.target.value })} />
          </div>
        </div>

        <div className="card">
          <h3>2 · Touchdown site</h3>
          <div className="coords">
            <div><span>E</span>{(site.x / 1000).toFixed(2)} km</div>
            <div><span>N</span>{(site.y / 1000).toFixed(2)} km</div>
            <div><span>ELEV</span>{assessment ? `${assessment.site.elevation_m.toFixed(0)} m` : "—"}</div>
            <div><span>SLOPE</span>{assessment ? `${assessment.site.slope_deg.toFixed(1)}°` : "—"}</div>
          </div>
          <p className="faint" style={{ fontSize: 12, margin: "10px 0 0" }}>Click the map or drag the gold marker.</p>
        </div>

        <div className="card">
          <h3>3 · Find a safer site</h3>
          <div className="field">
            <label>Search radius <b>{fmtKm(searchRadius)}</b></label>
            <input type="range" min={1000} max={8000} step={250} value={searchRadius} onChange={(e) => setSearchRadius(+e.target.value)} />
          </div>
          <div className="field">
            <label>Surface logistics cost <b>€{traverseCost}M / km</b></label>
            <input type="range" min={0} max={10} step={0.5} value={traverseCost} onChange={(e) => setTraverseCost(+e.target.value)} />
          </div>
          <button className="btn ice block" style={{ marginTop: 12 }} onClick={runOptimize} disabled={busy.optimize}>
            {busy.optimize ? <><Spinner /> Searching…</> : "Optimise touchdown site"}
          </button>
          {opt && (
            <label className="check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={showSearch} onChange={(e) => setShowSearch(e.target.checked)} />
              Show {opt.search.candidates.toLocaleString()} evaluated candidates
            </label>
          )}
        </div>
      </aside>

      {/* ---------------- centre: map ---------------- */}
      <MapView
        meta={meta}
        assets={assets}
        operators={operators}
        site={site}
        dispersion_m={lander.dispersion_m}
        optimized={best ? { x: best.site.x, y: best.site.y } : null}
        footprint={footprint}
        results={assessment?.assets}
        searchPoints={showSearch ? opt?.search.points : null}
        onSiteChange={setSite}
        focusAssetId={focus}
        busy={busy.footprint ? "Simulating ejecta footprint…" : busy.optimize ? "Optimiser searching candidate sites…" : null}
      />

      {/* ---------------- right: report ---------------- */}
      <aside className="side right">
        {error && <div className="callout" style={{ borderColor: "var(--crit)" }}>{error}</div>}

        <div className="card">
          <h3>Neighbour impact {busy.assess && <Spinner />}</h3>
          {s ? (
            <>
              <div className="total">
                <div>
                  <div className="label">Expected loss to others</div>
                  <div className="big" style={{ color: RISK_COLOR[s.worst_risk] }}>{fmtMeur(s.expected_loss_meur)}</div>
                </div>
                <RiskChip risk={s.worst_risk} />
              </div>
              <p className="faint" style={{ fontSize: 11.5, margin: "8px 0 0" }}>
                Physics engine · averaged over landing dispersion · {assessment!.compute_ms} ms
              </p>
            </>
          ) : <Spinner />}
        </div>

        {opt && (
          <div className="card" style={{ borderColor: "rgba(156,199,255,0.4)" }}>
            <h3>Optimised site</h3>
            {best ? (
              <>
                <div className="compare">
                  <div className="side-val">
                    <div className="k">Requested</div>
                    <div className="v" style={{ color: RISK_COLOR[opt.target.summary.worst_risk] }}>{fmtMeur(opt.target.summary.expected_loss_meur)}</div>
                  </div>
                  <div className="arrow">→</div>
                  <div className="side-val">
                    <div className="k">Optimised</div>
                    <div className="v" style={{ color: RISK_COLOR[best.summary.worst_risk] }}>{fmtMeur(best.summary.expected_loss_meur)}</div>
                  </div>
                </div>
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Risk reduction</dt><dd className="delta">−{(reduction * 100).toFixed(1)}%</dd>
                  <dt>Moved</dt><dd>{fmtKm(Math.hypot(best.site.x - site.x, best.site.y - site.y))}</dd>
                  <dt>Extra surface logistics</dt><dd>{fmtMeur(opt.best_traverse_meur || 0)}</dd>
                  <dt>Slope at site</dt><dd>{best.site.slope_deg.toFixed(1)}°</dd>
                  <dt>Candidates evaluated</dt><dd>{opt.search.candidates.toLocaleString()} ({opt.search.feasible.toLocaleString()} feasible)</dd>
                  <dt>Search time</dt><dd>{(opt.compute_ms / 1000).toFixed(1)} s</dd>
                </dl>
                <button className="btn primary block" style={{ marginTop: 12 }} onClick={adoptOptimized}>Adopt optimised site</button>
              </>
            ) : <p className="muted">No feasible site in the search radius. Widen the radius or relax constraints.</p>}
          </div>
        )}

        <div className="card">
          <h3>Assets in range</h3>
          {sortedResults.map((r) => {
            const a = assetById.get(r.asset_id);
            if (!a) return null;
            const op = opById.get(a.operator_id);
            const m = r.mechanisms;
            const main = (Object.keys(m) as (keyof typeof m)[]).reduce((x, y) => (m[x] >= m[y] ? x : y));
            return (
              <div key={r.asset_id} className="asset-row" onClick={() => setFocus(r.asset_id === focus ? null : r.asset_id)}>
                <div>
                  <div className="nm"><span className="dot" style={{ background: op?.color }} />{a.name}</div>
                  <div className="sub">{op?.name} · {fmtKm(r.distance_m)}{r.shielded ? " · terrain-shielded" : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="loss">{fmtMeur(r.expected_loss_meur)}</div>
                  <RiskChip risk={r.risk} />
                </div>
                <div className="bar"><div style={{ width: `${Math.min(100, Math.max(1, r.damage_fraction * 100 / 0.3))}%`, background: RISK_COLOR[r.risk] }} /></div>
                {r.risk !== "negligible" && (
                  <div className="mech">{fmtPct(r.damage_fraction)} damage · mainly {main} · {r.energy_fluence_j_m2.toExponential(1)} J/m²</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>AI copilot briefing</h3>
            <button className="btn small" onClick={runBrief} disabled={busy.brief || !assessment}>
              {busy.brief ? <><Spinner /> Writing…</> : brief ? "Regenerate" : "Generate"}
            </button>
          </div>
          {brief ? (
            <div style={{ marginTop: 10 }}>
              <Markdown text={brief.markdown} />
              <div className="src" style={{ marginTop: 8 }}>
                {brief.source !== "template" ? `${brief.source === "openai" ? "OpenAI" : "Claude"} (${brief.model}) · ${brief.latency_ms} ms · figures from physics engine`
                  : "Offline template · figures from physics engine"}
              </div>
            </div>
          ) : <p className="faint" style={{ fontSize: 12, margin: "8px 0 0" }}>Plain-language risk explanation and mitigations. The AI never computes the numbers; it explains them.</p>}
        </div>

        <div className="card">
          <h3>File landing plan</h3>
          <div className="stack">
            <input className="input" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Plan name" />
            <input className="input" value={windowStr} onChange={(e) => setWindowStr(e.target.value)} placeholder="Landing window" />
            <button className="btn primary block" onClick={submit} disabled={busy.submit || !assessment}>
              {busy.submit ? <><Spinner /> Filing…</> : "File plan & notify affected operators"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
