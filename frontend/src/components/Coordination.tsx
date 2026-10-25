import { useEffect, useState } from "react";
import { api, fmtMeur, RISK_COLOR } from "../api";
import { useMission } from "../mission";
import { Icon } from "./Icon";

export function CommandOverview() {
  const operators = useMission((s) => s.operators),
    assets = useMission((s) => s.assets),
    plans = useMission((s) => s.plans),
    notices = useMission((s) => s.notices),
    acting = useMission((s) => s.actingId),
    error = useMission((s) => s.coordinationError);
  const own = plans.filter((p) => p.operator_id === acting),
    pending = notices.filter(
      (n) => n.to_operator_id === acting && n.status === "unread",
    ).length,
    objections = notices.filter(
      (n) => n.from_operator_id === acting && n.status === "objection",
    ).length;
  return (
    <div className="command-overview">
      <div>
        <strong>{operators.length.toString().padStart(2, "0")}</strong>
        <span>REGISTERED ORGS</span>
      </div>
      <button onClick={() => useMission.getState().setMode("registry")}>
        <strong>{assets.length.toString().padStart(2, "0")}</strong>
        <span>SHARED ASSETS</span>
      </button>
      <button onClick={() => useMission.getState().setMode("notices")}>
        <strong>{own.length.toString().padStart(2, "0")}</strong>
        <span>YOUR FILED PLANS</span>
      </button>
      <button
        className={pending + objections ? "needs-attention" : ""}
        onClick={() => useMission.getState().setMode("notices")}
      >
        <strong>{(pending + objections).toString().padStart(2, "0")}</strong>
        <span>COORDINATION ACTIONS</span>
      </button>
      {error && <span className="command-error">Data refresh failed</span>}
    </div>
  );
}

export default function Coordination() {
  const ownAssets = useMission((s) => s.assets.filter((a) => a.operator_id === s.actingId).length),
    isDemo = useMission((s) => !!s.user?.demo);
  const acting = useMission((s) => s.actingId),
    notices = useMission((s) => s.notices),
    plans = useMission((s) => s.plans),
    operators = useMission((s) => s.operators),
    error = useMission((s) => s.coordinationError);
  const [box, setBox] = useState<"inbox" | "sent" | "plans">("inbox"),
    [selected, setSelected] = useState<string | null>(null),
    [reply, setReply] = useState(""),
    [pending, setPending] = useState(false),
    [actError, setActError] = useState<string | null>(null);
  useEffect(() => {
    setSelected(null);
    setReply("");
    setActError(null);
    setBox(acting === "kestrel" ? "sent" : "inbox");
    void useMission.getState().refresh();
  }, [acting]);
  const items = notices.filter((n) =>
      box === "inbox"
        ? n.to_operator_id === acting
        : n.from_operator_id === acting,
    ),
    current = items.find((n) => n.id === selected) ?? items[0],
    ownPlans = plans.filter((p) => p.operator_id === acting),
    plan = plans.find((p) => p.id === current?.plan_id);
  const siblings = notices.filter((n) => n.plan_id === current?.plan_id),
    responses = siblings.filter((n) => n.status !== "unread").length;
  async function respond(status: "acknowledged" | "objection") {
    if (!current || current.to_operator_id !== acting) return;
    setPending(true);
    setActError(null);
    try {
      await api.updateNotice(current.id, status, reply.trim() || undefined);
      await useMission.getState().refresh();
      setReply("");
      useMission
        .getState()
        .notify(`${current.id}: ${status} saved in the demo registry.`);
    } catch (e) {
      setActError(String(e));
    } finally {
      setPending(false);
    }
  }
  function loadPlan() {
    if (!plan) return;
    useMission.getState().updateLander(plan.lander);
    useMission.getState().moveSite(plan.site);
    useMission.setState({ missionName: plan.name, window: plan.window });
    useMission.getState().focus("site");
    useMission
      .getState()
      .notify(
        `Loaded filed proposal ${plan.id} into the working draft. The saved proposal is unchanged.`,
      );
  }
  return (
    <>
      <aside className="floating-panel coordination-list">
        <div className="panel-header">
          <span>CROSS-OPERATOR COORDINATION</span>
          <Icon name="Radio" size={16} />
        </div>
        <div className="panel-content">
          <div className="eyeline compact">PLAN. NOTIFY. REVIEW.</div>
          <h2>No mission lands alone.</h2>
          <p className="panel-intro">
            {operators.find((o) => o.id === acting)?.name}
            <br />
            Live · refreshes every 10 s
          </p>
          <div className="coordination-tabs">
            {(["inbox", "sent", "plans"] as const).map((t) => (
              <button
                className={box === t ? "active" : ""}
                key={t}
                onClick={() => {
                  setBox(t);
                  setSelected(null);
                  setReply("");
                }}
              >
                {t.toUpperCase()}
                <span>
                  {t === "plans"
                    ? ownPlans.length
                    : notices.filter((n) =>
                        t === "inbox"
                          ? n.to_operator_id === acting
                          : n.from_operator_id === acting,
                      ).length}
                </span>
              </button>
            ))}
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
              <button onClick={() => void useMission.getState().refresh()}>
                Retry
              </button>
            </p>
          )}
          {box === "plans" ? (
            <div className="filed-plans">
              {ownPlans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    useMission.getState().updateLander(p.lander);
                    useMission.getState().moveSite(p.site);
                    useMission.setState({
                      missionName: p.name,
                      window: p.window,
                    });
                    useMission.getState().focus("site");
                  }}
                >
                  <span>
                    {p.id}
                    <small>{p.status} · backend status</small>
                  </span>
                  <strong>{p.name}</strong>
                  <p>{fmtMeur(p.summary.expected_loss_meur)} modeled loss</p>
                  <small>
                    LOAD PROPOSAL INTO DRAFT{" "}
                    <Icon name="ArrowRight" size={12} />
                  </small>
                </button>
              ))}
              {!ownPlans.length && (
                <p className="panel-note">
                  No plans filed for this organization.
                </p>
              )}
            </div>
          ) : (
            <div className="coordination-notices">
              {items.map((n) => {
                const other = operators.find(
                  (o) =>
                    o.id ===
                    (box === "inbox" ? n.from_operator_id : n.to_operator_id),
                );
                return (
                  <button
                    key={n.id}
                    className={current?.id === n.id ? "active" : ""}
                    onClick={() => {
                      setSelected(n.id);
                      setReply("");
                      setActError(null);
                    }}
                  >
                    <div className="row between">
                      <span>
                        <span
                          className="status-dot"
                          style={{ background: other?.color }}
                        />
                        {other?.short}
                      </span>
                      <span className={`notice-state state-${n.status}`}>
                        {n.status}
                      </span>
                    </div>
                    <strong>{n.subject}</strong>
                    <div className="row between">
                      <span>{n.id}</span>
                      <span style={{ color: RISK_COLOR[n.max_risk] }}>
                        {fmtMeur(n.expected_loss_meur)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {!items.length && (
                <div className="empty-state">
                  <Icon name="Radio" size={25} />
                  <h3>
                    No {box === "inbox" ? "incoming" : "outgoing"} notices.
                  </h3>
                  {box === "inbox" && !ownAssets ? (
                    <>
                      <p>
                        Your organization has no registered assets yet, so no
                        landing can put it at risk. Register your installations
                        to receive consultation notices from other operators.
                      </p>
                      <button
                        className="outline-button full"
                        onClick={() => useMission.getState().setMode("registry")}
                      >
                        <Icon name="Plus" size={14} /> REGISTER AN ASSET
                      </button>
                    </>
                  ) : box === "inbox" ? (
                    <p>
                      You are notified automatically when another operator files
                      a landing that puts one of your assets at risk.
                    </p>
                  ) : (
                    <p>
                      File a landing proposal: every operator whose assets are
                      at risk is notified automatically.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            className="action-primary full"
            onClick={() => useMission.getState().setMode("report")}
          >
            PREPARE A COORDINATION PLAN <Icon name="ArrowRight" size={15} />
          </button>
        </div>
      </aside>
      <aside className="floating-panel exposure-panel coordination-detail">
        <div className="panel-header">
          <span>CONSULTATION RECORD</span>
          <Icon name="FileText" size={16} />
        </div>
        {current && box !== "plans" ? (
          <>
            <div className="panel-content">
              <span className="demo-config-label">
                PERSISTED BACKEND NOTICE / {current.id}
              </span>
              <h2>{current.subject}</h2>
              <p className="panel-note">
                {operators.find((o) => o.id === current.from_operator_id)?.name}
                <br />→{" "}
                {operators.find((o) => o.id === current.to_operator_id)?.name}
              </p>
              <div className="coordination-timeline">
                <div className="complete">
                  <span>01</span>
                  <p>
                    Plan filed
                    <small>
                      {current.plan_id} ·{" "}
                      {new Date(current.created_at * 1000).toLocaleString()}
                    </small>
                  </p>
                  <Icon name="Check" size={13} />
                </div>
                <div className="complete">
                  <span>02</span>
                  <p>
                    Notice created
                    <small>In-app demo registry · no external delivery</small>
                  </p>
                  <Icon name="Check" size={13} />
                </div>
                <div
                  className={
                    current.status === "unread" ? "current" : "complete"
                  }
                >
                  <span>03</span>
                  <p>
                    {current.status === "unread"
                      ? "Awaiting recipient response"
                      : current.status === "objection"
                        ? "Objection recorded"
                        : "Acknowledgement recorded"}
                    <small>
                      {box === "sent"
                        ? `${responses} of ${siblings.length} visible recipients responded`
                        : "Recipient response persists on backend"}
                    </small>
                  </p>
                </div>
                <div className="unsupported">
                  <span>04</span>
                  <p>
                    Resolution
                    <small>No plan-update or resolution endpoint</small>
                  </p>
                </div>
              </div>
              {plan && (
                <div className="notice-plan-summary">
                  <span className="panel-subtitle">
                    FILED PROPOSAL / {plan.name}
                  </span>
                  <dl className="data-list">
                    <dt>Site E / N</dt>
                    <dd>
                      {plan.site.x} / {plan.site.y} m
                    </dd>
                    <dt>Window</dt>
                    <dd>{plan.window}</dd>
                    <dt>Backend plan status</dt>
                    <dd>{plan.status}</dd>
                  </dl>
                  <button className="outline-button full" onClick={loadPlan}>
                    INSPECT PROPOSAL ON MAP{" "}
                    <Icon name="LocateFixed" size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="panel-section">
              <span className="panel-subtitle">BACKEND CONSULTATION BRIEF</span>
              <div className="notice-evidence">{current.body}</div>
              {current.reply && (
                <div className="saved-reply">
                  <span className="panel-subtitle">RECIPIENT RESPONSE</span>
                  <p>{current.reply}</p>
                </div>
              )}
            </div>
            <div className="panel-section">
              {current.to_operator_id === acting ? (
                <>
                  <label className="form-label">
                    RESPONSE / OPTIONAL
                    <textarea
                      maxLength={1000}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Operational concern, mitigation request or acknowledgement…"
                    />
                  </label>
                  <div className="response-actions">
                    <button
                      className="outline-button"
                      disabled={pending}
                      onClick={() => void respond("acknowledged")}
                    >
                      <Icon name="Check" size={14} />
                      ACKNOWLEDGE
                    </button>
                    <button
                      className="outline-button danger"
                      disabled={pending}
                      onClick={() => void respond("objection")}
                    >
                      <Icon name="Flag" size={14} />
                      OBJECT
                    </button>
                  </div>
                  {actError && (
                    <p className="inline-error" role="alert">
                      {actError}
                    </p>
                  )}
                </>
              ) : isDemo ? (
                <>
                  <button
                    className="outline-button full"
                    onClick={() =>
                      void useMission
                        .getState()
                        .switchOperator(current.to_operator_id)
                    }
                  >
                    VIEW AS{" "}
                    {
                      operators.find((o) => o.id === current.to_operator_id)
                        ?.short
                    }{" "}
                    <Icon name="ArrowRight" size={14} />
                  </button>
                  <p className="panel-note">
                    Signs in to the recipient's demo account.
                  </p>
                </>
              ) : (
                <p className="panel-note">
                  Awaiting the recipient organization's response.
                </p>
              )}
            </div>
            <div className="panel-section">
              <p className="panel-note">
                To propose mitigation, optimize the working draft and file a new
                proposal. This backend cannot amend or link the old plan, close
                objections, or mark a consultation resolved.
              </p>
              <button
                className="action-text full"
                onClick={() => useMission.getState().setMode("optimizer")}
              >
                COMPARE A REVISED LANDING SITE{" "}
                <Icon name="ArrowRight" size={14} />
              </button>
            </div>
          </>
        ) : (
          <div className="panel-content registry-empty">
            <Icon name="ShieldCheck" size={30} />
            <h2>A shared decision trail.</h2>
            <p>
              Open a consultation to inspect the filed proposal and its actual
              recipient response.
            </p>
            <div className="registry-principle">
              <p>
                Plan → Notify → Review → Respond
                <br />
                <span>Every response is stored with the notice and visible to both organizations.</span>
              </p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
