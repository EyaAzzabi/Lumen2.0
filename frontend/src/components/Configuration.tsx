import { useMission } from "../mission";
import { Icon } from "./Icon";
import NumericInput from "./NumericInput";

export function MissionFields() {
  const meta = useMission((s) => s.meta),
    lander = useMission((s) => s.lander),
    preset = useMission((s) => s.presetId),
    name = useMission((s) => s.missionName),
    site = useMission((s) => s.site);
  return (
    <>
      <label className="form-label">
        MISSION IDENTIFIER
        <input
          maxLength={80}
          value={name}
          onChange={(e) => useMission.setState({ missionName: e.target.value })}
        />
      </label>
      <label className="form-label">
        LANDER CLASS
        <select
          value={preset}
          onChange={(e) => {
            const p = meta?.landers.find((p) => p.id === e.target.value);
            if (p)
              useMission.getState().updateLander(
                {
                  label: p.label,
                  thrust_kn: p.thrust_kn,
                  hover_s: p.hover_s,
                  dispersion_m: p.dispersion_m,
                },
                p.id,
              );
          }}
        >
          {preset === "custom" && <option value="custom">Custom lander</option>}
          {meta?.landers.map((p) => (
            <option value={p.id} key={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="section-divider" />
      {(
        [
          {
            key: "thrust_kn",
            label: "Engine thrust",
            unit: "kN",
            min: 1,
            max: 5000,
            step: 1,
          },
          {
            key: "hover_s",
            label: "Low-altitude hover",
            unit: "s",
            min: 2,
            max: 300,
            step: 1,
          },
          {
            key: "dispersion_m",
            label: "Landing dispersion",
            unit: "m",
            min: 0,
            max: 2000,
            step: 10,
          },
        ] as const
      ).map((f) => (
        <label className="parameter" key={f.key}>
          <span>
            {f.label}
            <b>
              {lander[f.key].toLocaleString()} <em>{f.unit}</em>
            </b>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={lander[f.key]}
            onChange={(e) =>
              useMission.getState().updateLander({
                [f.key]: +e.target.value,
                label: "Custom lander",
              })
            }
          />
          <small>
            {f.min.toLocaleString()} {f.unit}
            <span>
              {f.max.toLocaleString()} {f.unit}
            </span>
          </small>
        </label>
      ))}
      <div className="section-divider" />
      <div className="panel-subtitle">LOCAL TOUCHDOWN COORDINATES</div>
      <div className="coordinate-inputs">
        {(["x", "y"] as const).map((k, i) => (
          <label key={k}>
            {i ? "NORTH" : "EAST"}
            <NumericInput
              label={`${i ? "North" : "East"} coordinate in metres`}
              min={-15000}
              max={15000}
              step={50}
              value={site[k]}
              onCommit={(value) =>
                useMission
                  .getState()
                  .moveSite({ ...useMission.getState().site, [k]: value })
              }
            />
            <span>m</span>
          </label>
        ))}
      </div>
      <p className="panel-note">
        Local east / north coordinates, not geographic latitude and longitude.
      </p>
    </>
  );
}

export default function Configuration() {
  return (
    <aside className="floating-panel configuration">
      <div className="panel-header">
        <span>01 / MISSION CONFIGURATION</span>
        <Icon name="SlidersHorizontal" size={16} />
      </div>
      <div className="panel-content">
        <h2>Prepare your descent.</h2>
        <p className="panel-intro">Every parameter shapes the footprint.</p>
        <MissionFields />
        <button
          className="action-primary full"
          onClick={() => {
            useMission.getState().setMode("operations");
            useMission.getState().focus("overview");
          }}
        >
          CONTINUE TO OPERATIONS <Icon name="ArrowRight" size={16} />
        </button>
      </div>
    </aside>
  );
}
