import { useEffect, useState } from "react";
import { api, fmtKm, fmtMeur, fmtPct, RISK_COLOR } from "../api";
import { useMission } from "../mission";
import { Icon } from "./Icon";
import { Modal } from "./Commercial";

export function RegistryPanel() {
  const assets = useMission((s) => s.assets),
    operators = useMission((s) => s.operators),
    meta = useMission((s) => s.meta),
    filter = useMission((s) => s.registryFilter),
    acting = useMission((s) => s.actingId),
    selected = useMission((s) => s.selectedAsset),
    picking = useMission((s) => s.pickingAsset),
    pick = useMission((s) => s.assetPick);
  const [adding, setAdding] = useState(picking),
    [name, setName] = useState(""),
    [type, setType] = useState("solar_array"),
    [value, setValue] = useState("25"),
    [x, setX] = useState("0"),
    [y, setY] = useState("0"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  // A point chosen on the terrain fills the form (map-first registration).
  useEffect(() => {
    if (!pick) return;
    setX(String(pick.x));
    setY(String(pick.y));
    setAdding(true);
    useMission.setState({ assetPick: null });
  }, [pick]);
  useEffect(() => {
    if (picking) setAdding(true);
  }, [picking]);
  function pickOnMap() {
    useMission.setState({ pickingAsset: true, selectedAsset: null });
    useMission.getState().focus("top");
  }
  const owned = assets.filter((a) => a.operator_id === acting).length;
  const visible = assets.filter(
    (a) =>
      (filter.operator === "all" || a.operator_id === filter.operator) &&
      (filter.type === "all" || a.type === filter.type) &&
      (filter.region === "all" ||
        (filter.region === "north" ? a.y >= 0 : a.y < 0)),
  );
  async function add() {
    if (!useMission.getState().session?.permissions.includes("assets:write"))
      return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.addAsset({
        operator_id: acting,
        name: name.trim(),
        type,
        x: Number(x),
        y: Number(y),
        value_meur: Number(value),
      });
      await useMission.getState().refresh();
      useMission.getState().selectAsset(a.id);
      setAdding(false);
      setName("");
      useMission
        .getState()
        .notify(
          `${a.name} registered in the shared demo infrastructure registry.`,
        );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="floating-panel registry-panel">
      <div className="panel-header">
        <span>SHARED LUNAR REGISTRY</span>
        <Icon name="Layers" size={16} />
      </div>
      <div className="panel-content">
        <div className="eyeline compact">A COMMON OPERATIONAL PICTURE</div>
        <h2>Know your neighbors.</h2>
        <p className="panel-intro">
          Shared infrastructure across {operators.length} registered fictional
          organizations.
        </p>
        <div className="registry-scope">
          <button
            className={filter.operator === "all" ? "active" : ""}
            onClick={() =>
              useMission.setState({
                registryFilter: { ...filter, operator: "all" },
              })
            }
          >
            SHARED / {assets.length}
          </button>
          <button
            className={filter.operator === acting ? "active" : ""}
            onClick={() =>
              useMission.setState({
                registryFilter: { ...filter, operator: acting },
              })
            }
          >
            OWNED / {assets.filter((a) => a.operator_id === acting).length}
          </button>
        </div>
        <label className="form-label">
          OWNING ORGANIZATION
          <select
            value={filter.operator}
            onChange={(e) =>
              useMission.setState({
                registryFilter: { ...filter, operator: e.target.value },
              })
            }
          >
            <option value="all">All organizations</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <div className="registry-filter-pair">
          <label className="form-label">
            ASSET TYPE
            <select
              value={filter.type}
              onChange={(e) =>
                useMission.setState({
                  registryFilter: { ...filter, type: e.target.value },
                })
              }
            >
              <option value="all">All types</option>
              {meta?.asset_types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            LOCAL REGION
            <select
              value={filter.region}
              onChange={(e) =>
                useMission.setState({
                  registryFilter: { ...filter, region: e.target.value },
                })
              }
            >
              <option value="all">Full region</option>
              <option value="north">North / N ≥ 0</option>
              <option value="south">South / N &lt; 0</option>
            </select>
          </label>
        </div>
        <div className="row between">
          <span className="panel-subtitle">
            {visible.length} ASSETS IN VIEW
          </span>
          <button
            className="action-text"
            disabled={
              !useMission
                .getState()
                .session?.permissions.includes("assets:write")
            }
            onClick={() => setAdding(!adding)}
          >
            <Icon name={adding ? "X" : "Plus"} size={14} />
            {adding ? "CLOSE" : "REGISTER"}
          </button>
        </div>
        {adding && (
          <form
            className="asset-register-form"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <span className="panel-note">
              Registering for {operators.find((o) => o.id === acting)?.name}
            </span>
            <label className="form-label">
              ASSET NAME
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="form-label">
              TYPE
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {meta?.asset_types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`outline-button full ${picking ? "armed" : ""}`}
              onClick={() =>
                picking ? useMission.setState({ pickingAsset: false }) : pickOnMap()
              }
            >
              <Icon name="Crosshair" size={15} />
              {picking ? "Click the terrain… (cancel)" : "Pick the position on the map"}
            </button>
            <div className="registry-filter-pair">
              <label className="form-label">
                EAST / m
                <input
                  type="number"
                  required
                  min={-15000}
                  max={15000}
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                />
              </label>
              <label className="form-label">
                NORTH / m
                <input
                  type="number"
                  required
                  min={-15000}
                  max={15000}
                  value={y}
                  onChange={(e) => setY(e.target.value)}
                />
              </label>
            </div>
            <label className="form-label">
              REPLACEMENT VALUE / M€
              <input
                type="number"
                required
                min={0.001}
                max={10000}
                step={0.001}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="action-primary full"
              disabled={busy || !name.trim()}
              type="submit"
            >
              {busy ? "REGISTERING…" : "ADD TO SHARED REGISTRY"}
            </button>
          </form>
        )}
        {!owned && !adding && (
          <div className="teaching-empty">
            <Icon name="Box" size={22} />
            <div>
              <b>Your organization has no registered assets yet.</b>
              <p>
                Register your installations so other operators are notified
                when their landings put them at risk.
              </p>
              <button
                className="outline-button full"
                disabled={!useMission.getState().session?.permissions.includes("assets:write")}
                onClick={() => {
                  setAdding(true);
                  pickOnMap();
                }}
              >
                <Icon name="Crosshair" size={14} /> Register your first asset
              </button>
            </div>
          </div>
        )}
        <div className="registry-assets">
          {visible.map((a) => {
            const o = operators.find((o) => o.id === a.operator_id);
            return (
              <button
                key={a.id}
                className={selected === a.id ? "selected" : ""}
                onClick={() => useMission.getState().selectAsset(a.id)}
              >
                <span className="registry-asset-type">
                  <Icon
                    name={
                      a.type === "solar_array"
                        ? "Zap"
                        : a.type === "comms_relay"
                          ? "Radio"
                          : a.type === "habitat"
                            ? "Box"
                            : "Target"
                    }
                    size={18}
                  />
                </span>
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    <span
                      className="status-dot"
                      style={{ background: o?.color }}
                    />
                    {o?.short} · {a.type.replace(/_/g, " ")}
                  </small>
                  <span className="mono">
                    E {(a.x / 1000).toFixed(2)} / N {(a.y / 1000).toFixed(2)} km
                  </span>
                </div>
                <Icon name="ChevronRight" size={14} />
              </button>
            );
          })}
          {!visible.length && (
            <p className="panel-note">
              No infrastructure matches these filters.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

export function RegistryDetail() {
  const assets = useMission((s) => s.assets),
    selected = useMission((s) => s.selectedAsset),
    operators = useMission((s) => s.operators),
    assessment = useMission((s) => s.assessment),
    plans = useMission((s) => s.plans),
    acting = useMission((s) => s.actingId);
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const a = assets.find((a) => a.id === selected),
    result = assessment?.assets.find((r) => r.asset_id === selected),
    nearby = a
      ? plans.filter((p) => Math.hypot(p.site.x - a.x, p.site.y - a.y) <= 5000)
      : [];
  async function remove() {
    if (!a) return;
    setBusy(true);
    try {
      await api.deleteAsset(a.id);
      useMission.getState().selectAsset(null);
      await useMission.getState().refresh();
      setConfirm(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="floating-panel exposure-panel registry-detail">
      <div className="panel-header">
        <span>INFRASTRUCTURE RECORD</span>
        <Icon name="Box" size={16} />
      </div>
      {a ? (
        <>
          <div className="panel-content">
            <span className="demo-config-label">
              FICTIONAL REGISTERED INFRASTRUCTURE
            </span>
            <h2>{a.name}</h2>
            <p className="owner-line">
              <span
                className="status-dot"
                style={{
                  background: operators.find((o) => o.id === a.operator_id)
                    ?.color,
                }}
              />
              {operators.find((o) => o.id === a.operator_id)?.name}
            </p>
            <dl className="data-list">
              <dt>Function</dt>
              <dd>{a.type.replace(/_/g, " ")}</dd>
              <dt>East / north</dt>
              <dd>
                {a.x} / {a.y} m
              </dd>
              <dt>Replacement value</dt>
              <dd>{fmtMeur(a.value_meur)}</dd>
              <dt>Operational criticality</dt>
              <dd>Not assigned by registry</dd>
              <dt>Ownership</dt>
              <dd>
                {a.operator_id === acting
                  ? "Your demo organization"
                  : "Shared / another operator"}
              </dd>
            </dl>
          </div>
          <div className="panel-section">
            <span className="panel-subtitle">
              CURRENT DRAFT MISSION EXPOSURE
            </span>
            {result ? (
              <>
                <div
                  className="hero-metric"
                  style={{ color: RISK_COLOR[result.risk] }}
                >
                  {fmtPct(result.damage_fraction)}
                </div>
                <span
                  className="risk-pill"
                  style={{ color: RISK_COLOR[result.risk] }}
                >
                  {result.risk.toUpperCase()} MODELED DAMAGE
                </span>
                <dl className="data-list">
                  <dt>Distance from draft site</dt>
                  <dd>{fmtKm(result.distance_m)}</dd>
                  <dt>Modeled loss</dt>
                  <dd>{fmtMeur(result.expected_loss_meur)}</dd>
                  <dt>Energy fluence</dt>
                  <dd>{result.energy_fluence_j_m2.toExponential(2)} J/m²</dd>
                  <dt>Terrain shielding</dt>
                  <dd>
                    {result.shielded
                      ? "Shielded in model"
                      : "Not fully shielded"}
                  </dd>
                </dl>
              </>
            ) : (
              <p className="panel-note">
                Awaiting the current mission assessment.
              </p>
            )}
            <p className="panel-note">
              Exposure belongs to the current mission draft, not every filed
              plan.
            </p>
          </div>
          <div className="panel-section">
            <span className="panel-subtitle">
              FILED PROPOSALS WITHIN 5 KM / {nearby.length}
            </span>
            {nearby.map((p) => (
              <button
                className="nearby-plan"
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
                  {p.name}
                  <small>
                    {p.id} ·{" "}
                    {operators.find((o) => o.id === p.operator_id)?.short}
                  </small>
                </span>
                <Icon name="ChevronRight" size={14} />
              </button>
            ))}
            {!nearby.length && (
              <p className="panel-note">
                No filed proposal within this local distance.
              </p>
            )}
          </div>
          {a.operator_id === acting &&
            useMission
              .getState()
              .session?.permissions.includes("assets:write") && (
              <div className="panel-section">
                <button
                  className="outline-button danger full"
                  onClick={() => setConfirm(true)}
                >
                  REMOVE OWNED DEMO ASSET
                </button>
              </div>
            )}
        </>
      ) : (
        <div className="panel-content registry-empty">
          <Icon name="Crosshair" size={30} />
          <h2>Select an installation.</h2>
          <p>
            Inspect an asset on the lunar surface or choose one from the shared
            registry.
          </p>
          <div className="registry-principle">
            <Icon name="Radio" />
            <p>Your assets are part of someone else’s landing decision.</p>
          </div>
        </div>
      )}
      {confirm && a && (
        <Modal
          title="Remove registered asset?"
          onClose={() => setConfirm(false)}
        >
          <p>
            Remove {a.name} from the shared demo registry? Current assessments
            will be invalidated and recomputed.
          </p>
          {error && <p className="inline-error">{error}</p>}
          <button
            className="outline-button danger full"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? "REMOVING…" : "REMOVE THIS ASSET"}
          </button>
        </Modal>
      )}
    </aside>
  );
}
