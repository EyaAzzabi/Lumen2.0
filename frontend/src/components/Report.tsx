import { useMemo } from "react";
import { fmtKm, fmtMeur, fmtPct } from "../api";
import { useMission } from "../mission";
import { Markdown } from "../ui";
import { Icon } from "./Icon";

export default function Report() {
  const assessment = useMission((s) => s.assessment),
    opt = useMission((s) => s.optimization),
    lander = useMission((s) => s.lander),
    site = useMission((s) => s.site),
    assets = useMission((s) => s.assets),
    name = useMission((s) => s.missionName),
    windowText = useMission((s) => s.window),
    busy = useMission((s) => s.busy),
    brief = useMission((s) => s.brief),
    assessedAt = useMission((s) => s.assessedAt);
  const timestamp = useMemo(() => new Date().toISOString(), [assessment]);
  const acting = useMission((s) => s.actingId),
    operators = useMission((s) => s.operators),
    plans = useMission((s) => s.plans);
  const editing = useMission((s) => s.editingPlanId),
    editingRevision = useMission((s) => s.editingRevision),
    session = useMission((s) => s.session);
  const parts = windowText.includes(" / ") ? windowText.split(" / ") : [];
  const match = windowText.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})[–-](\d{2}:\d{2}) UTC$/,
  );
  const start =
      parts[0]?.slice(0, 16) ?? (match ? `${match[1]}T${match[2]}` : ""),
    end = parts[1]?.slice(0, 16) ?? (match ? `${match[1]}T${match[3]}` : "");
  function setWindow(a: string, b: string) {
    useMission.setState({ window: `${a}:00Z / ${b}:00Z` });
  }
  const baseline = opt?.target,
    changed =
      baseline &&
      Math.hypot(baseline.site.x - site.x, baseline.site.y - site.y) > 1;
  return (
    <div className="report-workspace">
      <div className="report-toolbar">
        <div>
          <span className="eyeline compact">
            MISSION ASSURANCE / COORDINATION
          </span>
          <h1>Before the engines fire.</h1>
        </div>
        <button
          className="outline-button"
          onClick={() => window.print()}
          disabled={!assessment}
        >
          <Icon name="ArrowDownToLine" size={16} />
          PRINT / SAVE AS PDF
        </button>
      </div>
      <article className="mission-report">
        <header className="report-header">
          <div className="report-brand">
            <img src="/plume-mark.png" alt="PLUME official mark" />
            <strong>PLUME</strong>
          </div>
          <div>
            LANDING COORDINATION ASSESSMENT
            <small>PROTOTYPE · FICTIONAL MISSION SCENARIO</small>
          </div>
        </header>
        <div className="report-title">
          <span className="panel-subtitle">
            WORKING DRAFT FOR{" "}
            {operators.find((o) => o.id === acting)?.name.toUpperCase()}
          </span>
          <h2>{name || "Untitled mission"}</h2>
          <p>
            Generated{" "}
            {new Date(timestamp).toLocaleString("en-GB", { timeZone: "UTC" })}{" "}
            UTC · {plans.filter((p) => p.operator_id === acting).length} filed
            proposals in this organization’s demo registry
          </p>
        </div>
        {!assessment ? (
          <div className="report-empty">
            <Icon name="TriangleAlert" />
            <h3>A current assessment is required.</h3>
            <p>
              Return to operations and run the analysis before preparing a
              report.
            </p>
            <button
              className="outline-button"
              onClick={() => useMission.getState().setMode("operations")}
            >
              RETURN TO OPERATIONS
            </button>
          </div>
        ) : (
          <>
            <div className="report-kpis">
              <div>
                <span>CURRENT MODELED LOSS</span>
                <strong>
                  {fmtMeur(assessment.summary.expected_loss_meur)}
                </strong>
              </div>
              <div>
                <span>WORST ASSET EXPOSURE</span>
                <strong className="capitalize">
                  {assessment.summary.worst_risk}
                </strong>
              </div>
              <div>
                <span>ASSETS AT ELEVATED+ RISK</span>
                <strong>
                  {assessment.summary.assets_at_risk}
                  <small> / {assets.length}</small>
                </strong>
              </div>
            </div>
            <section className="report-section">
              <h3>
                <span>01</span>Mission configuration
              </h3>
              <dl className="report-grid">
                <dt>Lander</dt>
                <dd>{lander.label}</dd>
                <dt>Engine thrust</dt>
                <dd>{lander.thrust_kn.toLocaleString()} kN</dd>
                <dt>Low-altitude hover</dt>
                <dd>{lander.hover_s} s</dd>
                <dt>Landing dispersion</dt>
                <dd>{lander.dispersion_m} m</dd>
                <dt>Current site E / N</dt>
                <dd>
                  {site.x.toFixed(0)} / {site.y.toFixed(0)} m
                </dd>
                <dt>Slope / elevation</dt>
                <dd>
                  {assessment.site.slope_deg.toFixed(2)}° /{" "}
                  {assessment.site.elevation_m.toFixed(1)} m
                </dd>
                <dt>Landing window</dt>
                <dd>{windowText}</dd>
                <dt>Assessment timestamp</dt>
                <dd>{assessedAt ? new Date(assessedAt).toISOString() : "—"}</dd>
              </dl>
            </section>
            <section className="report-section">
              <h3>
                <span>02</span>Landing site comparison
              </h3>
              {baseline ? (
                <div className="report-comparison">
                  <div>
                    <span>ORIGINAL REQUEST</span>
                    <strong>
                      {fmtMeur(baseline.summary.expected_loss_meur)}
                    </strong>
                    <small>
                      E {baseline.site.x.toFixed(0)} / N{" "}
                      {baseline.site.y.toFixed(0)} m
                    </small>
                  </div>
                  <Icon name="ArrowRight" />
                  <div>
                    <span>
                      {changed
                        ? "SELECTED ALTERNATIVE"
                        : "CURRENT ORIGINAL SITE"}
                    </span>
                    <strong>
                      {fmtMeur(assessment.summary.expected_loss_meur)}
                    </strong>
                    <small>
                      E {site.x.toFixed(0)} / N {site.y.toFixed(0)} m
                    </small>
                  </div>
                </div>
              ) : (
                <p>
                  No optimization comparison has been generated for this
                  configuration. Current assessment only.
                </p>
              )}
              {opt && (
                <p className="report-note">
                  Search: {opt.search.candidates.toLocaleString()} candidates,{" "}
                  {opt.search.feasible.toLocaleString()} feasible. Objective is
                  modeled loss plus traverse cost, in M€. It is not a calibrated
                  risk probability.
                </p>
              )}
            </section>
            <section className="report-section">
              <h3>
                <span>03</span>Infrastructure exposure
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Registered asset</th>
                      <th>Distance</th>
                      <th>Damage</th>
                      <th>Modeled loss</th>
                      <th>Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...assessment.assets]
                      .sort(
                        (a, b) => b.expected_loss_meur - a.expected_loss_meur,
                      )
                      .map((r) => (
                        <tr key={r.asset_id}>
                          <td>
                            {assets.find((a) => a.id === r.asset_id)?.name ??
                              r.asset_id}
                          </td>
                          <td>{fmtKm(r.distance_m)}</td>
                          <td>{fmtPct(r.damage_fraction)}</td>
                          <td>{fmtMeur(r.expected_loss_meur)}</td>
                          <td>{r.risk}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="report-section">
              <h3>
                <span>04</span>Coordination briefing
              </h3>
              {brief ? (
                <>
                  <Markdown text={brief.markdown} />
                  <p className="report-note">
                    Source:{" "}
                    {brief.source !== "template"
                      ? `${brief.source === "openai" ? "OpenAI" : "Claude"} (${brief.model})`
                      : "Deterministic offline template"}
                    . Numbers supplied by the backend physics model.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Generate a briefing from the existing backend language
                    layer.
                  </p>
                  <button
                    className="outline-button"
                    disabled={!!busy}
                    onClick={() => void useMission.getState().generateBrief()}
                  >
                    {busy === "brief" ? "GENERATING…" : "GENERATE BRIEFING"}
                  </button>
                </>
              )}
            </section>
            <section className="report-section">
              <h3>
                <span>05</span>Assumptions and limitations
              </h3>
              <ul>
                <li>
                  Synthetic south-pole terrain; all operators, infrastructure
                  and values are fictional.
                </li>
                <li>
                  Simplified ballistic ejecta model; no CFD or DSMC simulation.
                  Damage sensitivities are engineering estimates.
                </li>
                <li>
                  Asset damage is averaged over the modeled landing dispersion.
                  The footprint instead represents a reference solar array at
                  the nominal site.
                </li>
                <li>
                  Replay and regolith particles are illustrative animations, not
                  time-resolved model output.
                </li>
                <li>
                  Mesh is sampled at 150 m; backend calculations retain their
                  native 50 m terrain.
                </li>
                <li>
                  This report is a prototype planning aid, not certification,
                  regulatory clearance or NASA approval.
                </li>
              </ul>
            </section>
            <footer className="report-footer">
              <span>PLUME / ONE LANDING. EVERYONE’S SAFETY.</span>
              <span>REVIEW REQUIRED · DEMONSTRATION DATA</span>
            </footer>
          </>
        )}
      </article>
      {editing && (
        <div className="panel-note">
          Revising {editing} · previous revision {editingRevision}.{" "}
          <button
            className="action-text"
            onClick={() =>
              useMission.setState({
                editingPlanId: null,
                editingRevision: null,
              })
            }
          >
            START A SEPARATE PLAN
          </button>
        </div>
      )}
      <div className="filing-panel">
        <div>
          <h3>Coordinate with your neighbors.</h3>
          <p>
            File in the demo registry and create consultation notices for
            affected operators.
          </p>
        </div>
        <label className="form-label">
          WINDOW START / UTC
          <input
            type="datetime-local"
            aria-label="Window start UTC"
            value={start}
            onChange={(e) => setWindow(e.target.value, end)}
          />
        </label>
        <label className="form-label">
          WINDOW END / UTC
          <input
            type="datetime-local"
            aria-label="Window end UTC"
            value={end}
            onChange={(e) => setWindow(start, e.target.value)}
          />
        </label>
        <button
          className="action-primary"
          disabled={
            !assessment ||
            !!busy ||
            !name.trim() ||
            !start ||
            !end ||
            !session?.permissions.includes("plans:write")
          }
          onClick={() => void useMission.getState().filePlan()}
        >
          <Icon name="Radio" size={16} />
          {busy === "submit"
            ? "FILING…"
            : editing
              ? `FILE REVISION ${(editingRevision ?? 1) + 1}`
              : "FILE COORDINATION PLAN"}
        </button>
      </div>
    </div>
  );
}
