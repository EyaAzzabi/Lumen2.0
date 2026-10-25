import { useState } from "react";
import type { Notice, Plan } from "../api";
import { useMission } from "../mission";

export default function ObjectionResolution({
  plan,
  notices,
}: {
  plan: Plan;
  notices: Notice[];
}) {
  const assets = useMission((s) => s.assets),
    busy = useMission((s) => s.busy);
  const [chosen, setChosen] = useState(""),
    [threshold, setThreshold] = useState("");
  const objections = notices.filter((n) => n.status === "objection");
  const notice = objections.find((n) => n.id === chosen) ?? objections[0];
  if (!notice) return null;
  const affected = assets.filter((a) => notice.asset_ids.includes(a.id));
  const valid =
    threshold.trim() !== "" &&
    Number.isFinite(Number(threshold)) &&
    Number(threshold) >= 0 &&
    Number(threshold) <= 100;
  function apply() {
    if (!valid || !affected.length) return;
    const s = useMission.getState();
    s.updateLander(plan.lander);
    s.moveSite(plan.site);
    useMission.setState({
      resolutionNoticeId: notice.id,
      missionName: plan.name,
      window: plan.window,
      missionReady: true,
      editingPlanId: plan.id,
      editingRevision: plan.revision ?? 1,
      assetLimits: affected.map((a) => ({
        asset_id: a.id,
        max_damage_fraction: Number(threshold) / 100,
      })),
      selectedAsset: null,
      optimization: null,
      preview: null,
    });
    s.setMode("optimizer");
  }
  return (
    <section className="resolution-card" aria-label="Resolve an objection">
      <span className="panel-subtitle">RESOLVE A CONCERN</span>
      <h3>Turn the objection into a constraint.</h3>
      <label className="form-label">
        OBJECTION
        <select
          aria-label="Objection to resolve"
          value={notice.id}
          onChange={(e) => {
            setChosen(e.target.value);
            setThreshold("");
          }}
        >
          {objections.map((n) => (
            <option key={n.id} value={n.id}>
              {n.subject}
            </option>
          ))}
        </select>
      </label>
      <blockquote>{notice.reply}</blockquote>
      <p>
        Protected assets:{" "}
        {affected.map((a) => a.name).join(", ") ||
          "No registered asset remains. Review this concern manually."}
      </p>
      <label className="form-label">
        REQUESTED MAXIMUM MEAN MODELED DAMAGE (%)
        <input
          aria-label="Requested maximum modeled damage percent"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Choose a threshold"
        />
      </label>
      <p className="panel-note">
        Choose this threshold with the affected operator. No threshold is
        inferred from their text. The optimizer checks the mean damage over
        touchdown samples, not a failure probability.
      </p>
      <button
        className="action-primary full"
        disabled={!valid || !affected.length || !!busy}
        onClick={apply}
      >
        Apply constraints and compare
      </button>
      <p className="panel-note">
        This prepares an editable revision. It does not send a notice or
        acknowledge the objection.
      </p>
    </section>
  );
}

export function ProtectionConstraints() {
  const limits = useMission((s) => s.assetLimits),
    assets = useMission((s) => s.assets),
    opt = useMission((s) => s.optimization),
    busy = useMission((s) => s.busy);
  if (!limits.length) return null;
  const results = opt?.protection_constraints;
  return (
    <section
      className="resolution-card"
      aria-label="Active protection constraints"
    >
      <span className="panel-subtitle">OPERATOR-CHOSEN LIMITS</span>
      {limits.map((l) => {
        const a = assets.find((a) => a.id === l.asset_id),
          before = opt?.target.assets.find((a) => a.asset_id === l.asset_id),
          after = opt?.best?.assets.find((a) => a.asset_id === l.asset_id);
        return (
          <div className="protection-row" key={l.asset_id}>
            <b>{a?.name ?? l.asset_id}</b>
            <p>
              Mean modeled damage ≤{" "}
              {(l.max_damage_fraction * 100).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
              %
            </p>
            {before && (
              <small>
                Original: {(before.damage_fraction * 100).toFixed(2)}%
                {after
                  ? ` → proposed: ${(after.damage_fraction * 100).toFixed(2)}%`
                  : ""}
              </small>
            )}
          </div>
        );
      })}
      {results && (
        <p role="status">
          {results.best_passes
            ? "The recommended site meets these limits in the model."
            : "No evaluated site met every constraint. Try a wider search, revise the mission or discuss the requested limits."}
        </p>
      )}
      <p className="panel-note">
        Checks apply to evaluated sites only. No experimental safety guarantee;
        the neighbor must review the new revision.
      </p>
      <button
        className="action-text"
        disabled={!!busy}
        onClick={() =>
          useMission.setState({
            assetLimits: [],
            resolutionNoticeId: null,
            optimization: null,
            preview: null,
          })
        }
      >
        Remove protection constraints
      </button>
    </section>
  );
}
