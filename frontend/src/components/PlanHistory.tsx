import { useEffect, useState } from "react";
import { api, fmtMeur, type PlanDetail, type Assessment } from "../api";
import { useMission } from "../mission";

export default function PlanHistory({ planId }: { planId: string }) {
  const acting = useMission((s) => s.actingId),
    refresh = useMission((s) => s.refreshKey),
    session = useMission((s) => s.session);
  const [detail, setDetail] = useState<PlanDetail | null>(null),
    [error, setError] = useState(""),
    [current, setCurrent] = useState<Assessment | null>(null);
  useEffect(() => {
    let live = true;
    setError("");
    setDetail(null);
    setCurrent(null);
    void api
      .planDetail(planId)
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [planId, acting, refresh]);
  async function reassess() {
    try {
      setCurrent(await api.reassessPlan(planId));
    } catch (e) {
      setError(String(e));
    }
  }
  async function withdraw() {
    if (!confirm("Withdraw this plan? Its history will be retained.")) return;
    try {
      await api.withdrawPlan(planId);
      await useMission.getState().refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  function revise() {
    if (!detail) return;
    const p = detail.plan,
      s = useMission.getState();
    s.updateLander(p.lander);
    s.moveSite(p.site);
    useMission.setState({
      missionReady: true,
      editingPlanId: p.id,
      draftId: null,
      draftVersion: 0,
      draftFingerprint: "",
      draftStatus: "local",
      draftError: null,
      editingRevision: p.revision ?? 1,
      missionName: p.name,
      window: p.window,
    });
    s.setMode("optimizer");
  }
  return (
    <section
      className="panel-section plan-history"
      aria-label="Plan revision history"
    >
      <span className="panel-subtitle">REVISION & COORDINATION HISTORY</span>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!detail ? (
        <p>Loading historical evidence…</p>
      ) : (
        <>
          <h3>
            {detail.plan.name} · r{detail.plan.revision ?? 1}
          </h3>
          <p className="coordination-status">{detail.plan.status}</p>
          <p className="panel-note">
            All required recipients must acknowledge the current revision.
            Coordination is not a safety certification.
          </p>
          {detail.revisions.map((r) => (
            <details key={r.revision_id}>
              <summary>
                Revision {r.revision ?? 1} ·{" "}
                {fmtMeur(r.summary.expected_loss_meur ?? 0)} modeled loss
              </summary>
              <p className="panel-note">
                E {r.site.x.toFixed(1)} / N {r.site.y.toFixed(1)} m · {r.window}
              </p>
              <p className="panel-note">
                PLUME Coordination Decision Dossier � persisted revision{" "}
                {r.revision ?? 1}
              </p>
              <div className="response-actions">
                <a
                  className="outline-button"
                  href={`/api/plans/${encodeURIComponent(planId)}/revisions/${r.revision ?? 1}/dossier?format=pdf`}
                >
                  Download PDF dossier
                </a>
                <a
                  className="outline-button"
                  href={`/api/plans/${encodeURIComponent(planId)}/revisions/${r.revision ?? 1}/dossier?format=json`}
                >
                  Download structured data
                </a>
              </div>
              {r.historical_assessment?.assessment ? (
                <>
                  <p className="panel-note">
                    Immutable snapshot ·{" "}
                    {
                      r.historical_assessment.assessment.provenance
                        ?.model_version
                    }{" "}
                    · seed{" "}
                    {r.historical_assessment.assessment.uncertainty?.seed}
                  </p>
                  {r.historical_assessment.assessment.assets.map((a) => (
                    <p className="panel-note" key={a.asset_id}>
                      {a.asset_id}: {(a.damage_fraction * 100).toFixed(2)}% mean
                      damage · q95{" "}
                      {((a.uncertainty?.q95 ?? 0) * 100).toFixed(2)}% · {a.risk}
                    </p>
                  ))}
                  <small>
                    Sample quantiles are not validated confidence intervals.
                  </small>
                </>
              ) : (
                <p className="panel-note">
                  Legacy record: original full assessment unavailable; not
                  reconstructed.
                </p>
              )}
            </details>
          ))}
          <details>
            <summary>Objections and response history</summary>
            {detail.notices.flatMap((n) =>
              (n.response_history ?? []).map((r, i) => (
                <p className="panel-note" key={n.id + i}>
                  r{n.revision ?? 1} · {n.to_operator_id} · {r.status}:{" "}
                  {r.reply || "No comment"} ·{" "}
                  {r.created_at
                    ? new Date(r.created_at * 1000).toISOString()
                    : "legacy time unknown"}
                </p>
              )),
            )}
          </details>
          <details>
            <summary>
              Append-only coordination events ({detail.events.length})
            </summary>
            {detail.events.map((e) => (
              <p className="panel-note" key={e.id}>
                {e.type} · {e.actor_id || "legacy"} ·{" "}
                {new Date(e.created_at * 1000).toISOString()}
              </p>
            ))}
          </details>
          {detail.plan.operator_id === acting &&
            session?.permissions.includes("plans:write") &&
            detail.plan.status !== "withdrawn" && (
              <>
                <button className="outline-button full" onClick={revise}>
                  PREPARE REVISION {(detail.plan.revision ?? 1) + 1}
                </button>
                <button
                  className="action-text full"
                  onClick={() => void reassess()}
                >
                  REASSESS CURRENT REGISTRY
                </button>
                <button
                  className="action-text full"
                  onClick={() => void withdraw()}
                >
                  WITHDRAW PLAN
                </button>
              </>
            )}
          {current && (
            <p className="panel-note">
              Current registry reassessment:{" "}
              {fmtMeur(current.summary.expected_loss_meur)}. Historical
              snapshots unchanged.
            </p>
          )}
        </>
      )}
    </section>
  );
}
