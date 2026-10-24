import { useEffect, useMemo, useState } from "react";
import type { Notice, Operator } from "./api";
import { api, fmtMeur } from "./api";
import { RiskChip } from "./ui";

interface Props { operators: Operator[]; actingId: string; refreshKey: number; onChanged: () => void }

export default function Notices({ operators, actingId, refreshKey, onChanged }: Props) {
  const [items, setItems] = useState<Notice[]>([]);
  const [box, setBox] = useState<"inbox" | "sent">("inbox");
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const opById = useMemo(() => new Map(operators.map((o) => [o.id, o])), [operators]);

  useEffect(() => { api.notices(actingId).then(setItems); }, [actingId, refreshKey]);
  useEffect(() => { setSel(null); }, [actingId, box]);

  const list = items.filter((n) => (box === "inbox" ? n.to_operator_id === actingId : n.from_operator_id === actingId));
  const current = list.find((n) => n.id === sel) || list[0];

  async function act(status: "acknowledged" | "objection") {
    if (!current) return;
    const n = await api.updateNotice(current.id, status, reply || undefined);
    setItems((xs) => xs.map((x) => (x.id === n.id ? n : x)));
    setReply("");
    onChanged();
  }

  return (
    <div className="page">
      <div className="page-inner">
        <h1>Consultation notices</h1>
        <p className="lede">
          Every filed landing plan automatically notifies the operators whose assets PLUME finds at risk, with the physics
          assessment attached. Neighbours acknowledge or object, so harmful-interference consultation happens before
          the engines fire, not after.
        </p>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="seg">
            <button className={box === "inbox" ? "on" : ""} onClick={() => setBox("inbox")}>Inbox</button>
            <button className={box === "sent" ? "on" : ""} onClick={() => setBox("sent")}>Sent</button>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>Viewing as {opById.get(actingId)?.name}. Switch operator in the top bar.</span>
        </div>
        {list.length === 0 ? (
          <div className="empty">
            {box === "inbox" ? "No notices for this operator yet. File a landing plan from the Mission Planner." : "No notices sent yet."}
          </div>
        ) : (
          <div className="inbox">
            <div className="stack" style={{ alignContent: "start" }}>
              {list.map((n) => {
                const other = opById.get(box === "inbox" ? n.from_operator_id : n.to_operator_id);
                return (
                  <div key={n.id} className={`notice-item ${current?.id === n.id ? "active" : ""} ${n.status === "unread" && box === "inbox" ? "unread" : ""}`}
                    onClick={() => setSel(n.id)}>
                    <div className="row between">
                      <span className="row" style={{ fontSize: 12 }}><span className="dot" style={{ background: other?.color }} />{other?.name}</span>
                      <RiskChip risk={n.max_risk} />
                    </div>
                    <div className="subj">{n.subject}</div>
                    <div className="row between faint" style={{ fontSize: 11.5 }}>
                      <span className="mono">{n.id} · {new Date(n.created_at * 1000).toLocaleTimeString()}</span>
                      <span className="mono" style={{ color: n.status === "objection" ? "var(--crit)" : n.status === "acknowledged" ? "var(--ok)" : "var(--gold)" }}>{n.status.toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {current && (
              <div className="card">
                <div className="row between" style={{ marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>{current.id} · plan {current.plan_id}</h3>
                  <span className="mono">{fmtMeur(current.expected_loss_meur)} at risk</span>
                </div>
                <div className="notice-body">{current.body}</div>
                {current.reply && <div className="callout" style={{ marginTop: 12 }}><b>Reply:</b> {current.reply}</div>}
                {box === "inbox" && current.status === "unread" && (
                  <div className="stack" style={{ marginTop: 14 }}>
                    <textarea className="input" placeholder="Optional reply (e.g. telescope covers closed 05:30–08:30 UTC)" value={reply} onChange={(e) => setReply(e.target.value)} />
                    <div className="row">
                      <button className="btn primary" onClick={() => act("acknowledged")}>Acknowledge</button>
                      <button className="btn" style={{ color: "var(--crit)" }} onClick={() => act("objection")}>Raise objection</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
