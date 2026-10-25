import { DraftSaveControl } from "./MissionLibrary";
import { useMission } from "../mission";
import { Icon } from "./Icon";
import NumericInput from "./NumericInput";
import { Term } from "../ui";

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
      <p className="panel-note">
        Spacecraft selections are presets. Select one explicitly to apply its
        displayed settings.
      </p>
      <details className="journey-details" open>
        <summary>Advanced mission settings</summary>
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
              <Term>{f.label}</Term>
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
      </details>
    </>
  );
}

export default function Configuration() {
  const name = useMission((s) => s.missionName),
    busy = useMission((s) => s.busy);
  return (
    <aside
      className="journey-panel prepare-panel"
      aria-label="Mission preparation"
    >
      <div className="journey-panel-head">
        <span>01 / PREPARE</span>
        <h2>Your landing starts here.</h2>
        <p>
          Name your mission, choose a lander, then place its touchdown point.
        </p>
      </div>
      <div className="journey-panel-body">
        <MissionFields />
        <button
          className="outline-button full"
          onClick={() => {
            useMission.setState({ placeMode: true });
            useMission.getState().focus("top");
          }}
        >
          Choose a point on the map
        </button>
        <p className="panel-note">
          Drag to inspect the scene. Coordinates and parameters are editable; no
          example result is preloaded.
        </p>
      </div>
      <div className="journey-panel-foot">
        <DraftSaveControl />
        <button
          className="action-primary full"
          disabled={!name.trim() || !!busy}
          onClick={() => {
            useMission.setState({ missionReady: true });
            useMission.getState().setMode("operations");
            useMission.getState().focus("overview");
          }}
        >
          Analyze this mission <Icon name="ArrowRight" size={17} />
        </button>
      </div>
    </aside>
  );
}
