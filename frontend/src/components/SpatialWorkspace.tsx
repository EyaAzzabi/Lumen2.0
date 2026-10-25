import { useMemo, useState } from "react";
import { fmtKm, fmtMeur, fmtPct, RISK_COLOR } from "../api";
import { useMission, type CameraView, type Layers } from "../mission";
import { Icon, type IconName } from "./Icon";

export const viewpoints = [
  {
    id: "colony",
    name: "South pole overview",
    tag: "SHARED INFRASTRUCTURE",
    image: "/lunar-hero.png",
    view: "overview",
  },
  {
    id: "crater",
    name: "Polar crater",
    tag: "SYNTHETIC TERRAIN",
    image: "/moon.jpg",
    view: "overview",
  },
  {
    id: "ridge",
    name: "Northern ridge",
    tag: "SYNTHETIC TERRAIN",
    image: "/lunar-hero.png",
    view: "overview",
  },
  {
    id: "landing",
    name: "Touchdown approach",
    tag: "CURRENT PROPOSAL",
    image: "/lunar-hangar.png",
    view: "site",
  },
] as const;

export function ViewpointStrip() {
  const active = useMission((s) => s.viewpoint),
    tour = useMission((s) => s.tour),
    reduced = useMission((s) => s.reducedMotion);
  return (
    <div className="viewpoint-strip">
      <div className="viewpoint-caption">
        <span>EXPLORE THE SURFACE</span>
        <small>ONE CONNECTED MISSION</small>
      </div>
      {viewpoints.map((p, i) => (
        <button
          key={p.id}
          className={`viewpoint-card view-${p.id} ${active === p.id ? "active" : ""}`}
          onClick={() => {
            useMission.setState({ viewpoint: p.id, tour: false });
            useMission.getState().focus(p.view as CameraView);
          }}
          style={{
            backgroundImage: `linear-gradient(0deg,#040b13,transparent 130%),url(${p.image})`,
          }}
        >
          <span className="viewpoint-number">0{i + 1}</span>
          <strong>{p.name}</strong>
          <small>{p.tag}</small>
          <Icon name="ArrowRight" size={15} />
        </button>
      ))}
      <button
        className={`tour-control ${tour ? "active" : ""}`}
        disabled={reduced}
        aria-pressed={tour}
        onClick={() => {
          useMission.setState({ tour: !tour });
          if (!tour) useMission.getState().focus("overview");
        }}
      >
        <Icon name={tour ? "Pause" : "Play"} size={18} />
        <span>{tour ? "PAUSE FLIGHT" : "CAMERA TOUR"}</span>
        <small>{reduced ? "Reduced motion" : "Illustrative flyover"}</small>
      </button>
    </div>
  );
}

export function QuickActions() {
  const selected = useMission((s) => s.selectedAsset),
    assets = useMission((s) => s.assets),
    assessment = useMission((s) => s.assessment),
    site = useMission((s) => s.site),
    busy = useMission((s) => s.busy),
    name = useMission((s) => s.missionName);
  const asset = assets.find((a) => a.id === selected),
    result = assessment?.assets.find((a) => a.asset_id === selected);
  return (
    <div className="workspace-dock">
      <div className="selected-context">
        <div className={`context-art ${asset ? "context-asset" : ""}`}>
          <Icon
            name={
              asset?.type === "solar_array"
                ? "Zap"
                : asset?.type === "habitat"
                  ? "Box"
                  : asset
                    ? "Radio"
                    : "Target"
            }
            size={34}
          />
          <span className="art-orbit" />
        </div>
        <div>
          <span className="dock-eyebrow">
            {asset ? "SELECTED INFRASTRUCTURE" : "CURRENT LANDING PROPOSAL"}
          </span>
          <h3>{asset?.name ?? name}</h3>
          <p>
            {asset
              ? `${asset.type.replace(/_/g, " ")} · fictional installation`
              : `E ${(site.x / 1000).toFixed(2)} / N ${(site.y / 1000).toFixed(2)} km`}
          </p>
        </div>
        <div className="context-numbers">
          {asset && result ? (
            <>
              <span>
                Distance to landing<b>{fmtKm(result.distance_m)}</b>
              </span>
              <span>
                Modeled damage
                <b style={{ color: RISK_COLOR[result.risk] }}>
                  {fmtPct(result.damage_fraction)}
                </b>
              </span>
            </>
          ) : (
            <>
              <span>
                Registered infrastructure<b>{assets.length} assets</b>
              </span>
              <span>
                Modeled loss
                <b>
                  {assessment
                    ? fmtMeur(assessment.summary.expected_loss_meur)
                    : "Computing…"}
                </b>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="quick-actions">
        <span className="dock-eyebrow">MISSION QUICK ACTIONS</span>
        <div>
          {(
            [
              [
                "Target",
                "Place site",
                () => {
                  useMission.setState({ placeMode: true, tour: false });
                  useMission.getState().focus("top");
                },
              ],
              [
                "Zap",
                "Simulate plume",
                () => void useMission.getState().simulate(),
              ],
              [
                "Sparkles",
                "Run optimizer",
                () => {
                  useMission.getState().setMode("optimizer");
                  void useMission.getState().optimize();
                },
              ],
              [
                "FileText",
                "Generate report",
                () => useMission.getState().setMode("report"),
              ],
            ] as [IconName, string, () => void][]
          ).map(([icon, label, action]) => (
            <button key={label} onClick={action} disabled={!!busy}>
              <Icon name={icon} size={23} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpatialToolbar() {
  const [query, setQuery] = useState(""),
    layers = useMission((s) => s.layers),
    assets = useMission((s) => s.assets),
    style = useMission((s) => s.sceneStyle),
    selected = useMission((s) => s.selectedAsset),
    assessment = useMission((s) => s.assessment),
    place = useMission((s) => s.placeMode);
  const matches = useMemo(
    () =>
      query.trim()
        ? assets.filter((a) =>
            `${a.name} ${a.type}`.toLowerCase().includes(query.toLowerCase()),
          )
        : [],
    [assets, query],
  );
  const types: [keyof Layers, string, IconName][] = [
    ["terrain", "Terrain", "Mountain"],
    ["infrastructure", "Bases & infrastructure", "Box"],
    ["zones", "Landing zones", "Target"],
    ["hazard", "Hazard exposure", "ShieldCheck"],
    ["candidates", "Optimizer candidates", "Sparkles"],
  ];
  return (
    <div className="spatial-toolbar">
      <div className="asset-search">
        <Icon name="Crosshair" size={16} />
        <input
          aria-label="Search infrastructure"
          placeholder="Search infrastructure, rover, telescope…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <Icon name="X" size={14} />
          </button>
        )}
        {query && (
          <div className="search-results">
            {matches.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  useMission.getState().selectAsset(a.id);
                  useMission.setState({ tour: false });
                  setQuery("");
                }}
              >
                <Icon name="LocateFixed" size={15} />
                <span>
                  {a.name}
                  <small>{a.type.replace(/_/g, " ")}</small>
                </span>
                <Icon name="ArrowRight" size={14} />
              </button>
            ))}
            {!matches.length && (
              <p>No registered installation matches this search.</p>
            )}
          </div>
        )}
      </div>
      <details className="layer-popover">
        <summary>
          <Icon name="Layers" size={16} />
          MAP LAYERS
          <Icon name="ChevronDown" size={13} />
        </summary>
        <div>
          <span className="dock-eyebrow">SURFACE VISUALIZATION</span>
          {types.map(([id, label, icon]) => (
            <label key={id}>
              <Icon name={icon} size={16} />
              <span>{label}</span>
              <input
                type="checkbox"
                checked={layers[id]}
                onChange={(e) =>
                  useMission.setState({
                    layers: { ...layers, [id]: e.target.checked },
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
      <div className="scene-style-switch">
        {(
          [
            ["perspective", "3D", "Orbit"],
            ["heatmap", "Exposure", "ShieldCheck"],
            ["wireframe", "Mesh", "Layers"],
            ["infrastructure", "Assets", "Box"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            className={style === id ? "active" : ""}
            onClick={() =>
              useMission.setState({
                sceneStyle: id,
                layers: {
                  ...layers,
                  terrain: true,
                  ...(id === "heatmap" ? { hazard: true } : {}),
                  ...(id === "infrastructure" ? { infrastructure: true } : {}),
                },
              })
            }
            aria-pressed={style === id}
          >
            <Icon name={icon} size={15} />
            {label}
          </button>
        ))}
      </div>
      {place && (
        <div className="placement-instruction">
          <span className="status-dot" />
          Click the terrain to reposition. Escape cancels.
        </div>
      )}
      {selected && assessment && (
        <button
          className="return-overview"
          onClick={() => {
            useMission.getState().selectAsset(null);
            useMission.getState().focus("overview");
          }}
        >
          <Icon name="ArrowLeft" size={14} />
          RETURN TO OVERVIEW
        </button>
      )}
    </div>
  );
}

export function PresetDock() {
  const meta = useMission((s) => s.meta),
    preset = useMission((s) => s.presetId);
  return (
    <div className="preset-dock">
      <div className="dock-eyebrow">
        SELECT YOUR LANDER <span>BACKEND MISSION PRESETS</span>
      </div>
      <div>
        {meta?.landers.map((p, i) => (
          <button
            key={p.id}
            className={preset === p.id ? "active" : ""}
            onClick={() =>
              useMission.getState().updateLander(
                {
                  label: p.label,
                  thrust_kn: p.thrust_kn,
                  hover_s: p.hover_s,
                  dispersion_m: p.dispersion_m,
                },
                p.id,
              )
            }
          >
            <Icon
              name={
                i === 0
                  ? "Box"
                  : i === 1
                    ? "ShieldCheck"
                    : i === 2
                      ? "Layers"
                      : "Zap"
              }
              size={27}
            />
            <span>
              {p.label}
              <small>
                {p.thrust_kn.toLocaleString()} kN · {p.hover_s}s hover
              </small>
            </span>
            <span className="preset-selected">
              <Icon name={preset === p.id ? "Check" : "Plus"} size={14} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
