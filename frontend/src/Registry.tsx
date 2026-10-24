import { useEffect, useMemo, useState } from "react";
import MapView from "./MapView";
import type { Asset, Meta, Operator, Plan, Pt } from "./api";
import { api, fmtMeur } from "./api";
import { RiskChip } from "./ui";

interface Props {
  meta: Meta; assets: Asset[]; operators: Operator[]; actingId: string; refreshKey: number; onChanged: () => void;
}

export default function Registry({ meta, assets, operators, actingId, refreshKey, onChanged }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pick, setPick] = useState<Pt | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("solar_array");
  const [value, setValue] = useState(25);
  const [err, setErr] = useState<string | null>(null);
  const opById = useMemo(() => new Map(operators.map((o) => [o.id, o])), [operators]);
  const typeLabel = useMemo(() => new Map(meta.asset_types.map((t) => [t.key, t.label])), [meta]);

  useEffect(() => { api.plans().then(setPlans); }, [refreshKey]);

  async function add() {
    if (!pick || !name.trim()) return;
    try {
      await api.addAsset({ operator_id: actingId, name: name.trim(), type, x: pick.x, y: pick.y, value_meur: value });
      setName(""); setPick(null); setErr(null);
      onChanged();
    } catch (e) { setErr(String(e)); }
  }
  async function remove(id: string) {
    await api.deleteAsset(id);
    onChanged();
  }

  return (
    <div className="page">
      <div className="page-inner">
        <h1>Shared asset registry</h1>
        <p className="lede">
          Each operator registers what it has on the surface. PLUME uses the shared registry to check every landing
          plan against everyone's assets. Positions and values below are fictional demo data.
        </p>
        <div className="grid2">
          <div className="card" style={{ padding: 0, overflow: "hidden", height: 460 }}>
            <MapView meta={meta} assets={assets} operators={operators} site={pick} onPick={setPick}
              hint={pick ? null : "Click the map to place a new asset"} />
          </div>
          <div className="card">
            <h3>Register an asset for {opById.get(actingId)?.name}</h3>
            <div className="stack">
              <input className="input" placeholder="Asset name" value={name} onChange={(e) => setName(e.target.value)} />
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                {meta.asset_types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <div className="field" style={{ marginTop: 0 }}>
                <label>Replacement value <b>€{value}M</b></label>
                <input type="range" min={1} max={500} value={value} onChange={(e) => setValue(+e.target.value)} />
              </div>
              <div className="coords">
                <div><span>E</span>{pick ? `${(pick.x / 1000).toFixed(2)} km` : "click map"}</div>
                <div><span>N</span>{pick ? `${(pick.y / 1000).toFixed(2)} km` : "click map"}</div>
              </div>
              {err && <div className="callout" style={{ borderColor: "var(--crit)" }}>{err}</div>}
              <button className="btn primary" disabled={!pick || !name.trim()} onClick={add}>Register asset</button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Registered assets ({assets.length})</h3>
          <table>
            <thead><tr><th>Asset</th><th>Operator</th><th>Type</th><th style={{ textAlign: "right" }}>Position (E, N)</th><th style={{ textAlign: "right" }}>Value</th><th /></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td><span className="row"><span className="dot" style={{ background: opById.get(a.operator_id)?.color }} />{opById.get(a.operator_id)?.name}</span></td>
                  <td className="muted">{typeLabel.get(a.type)}</td>
                  <td className="num">{(a.x / 1000).toFixed(2)}, {(a.y / 1000).toFixed(2)} km</td>
                  <td className="num">{fmtMeur(a.value_meur)}</td>
                  <td style={{ textAlign: "right" }}>
                    {a.operator_id === actingId && <button className="btn small ghost" onClick={() => remove(a.id)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Filed landing plans ({plans.length})</h3>
          {plans.length === 0 ? <p className="muted">No plans filed yet.</p> : (
            <table>
              <thead><tr><th>Plan</th><th>Operator</th><th>Lander</th><th>Window</th><th>Worst risk</th><th style={{ textAlign: "right" }}>Expected loss</th><th>Status</th></tr></thead>
              <tbody>
                {plans.map((pl) => (
                  <tr key={pl.id}>
                    <td><span className="mono">{pl.id}</span> · {pl.name}</td>
                    <td>{opById.get(pl.operator_id)?.name}</td>
                    <td className="muted">{pl.lander.label}</td>
                    <td className="muted">{pl.window}</td>
                    <td><RiskChip risk={pl.summary.worst_risk} /></td>
                    <td className="num">{fmtMeur(pl.summary.expected_loss_meur)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{pl.status.toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
