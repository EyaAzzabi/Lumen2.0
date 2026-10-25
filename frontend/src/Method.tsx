import { useEffect, useMemo, useState } from "react";
import type { Curves, Meta } from "./api";
import { api, fmtKm } from "./api";

const LANDER_COLORS: Record<string, string> = {
  clps: "#5eead4",
  crew: "#9cc7ff",
  cargo: "#f2c27b",
  superheavy: "#f43f5e",
};

function Chart({ curves, assetType }: { curves: Curves; assetType: string }) {
  const W = 560,
    H = 280,
    L = 48,
    R = 12,
    T = 12,
    B = 34;
  const d = curves.distance_m;
  const xs = (m: number) =>
    L +
    ((Math.log10(m) - Math.log10(d[0])) /
      (Math.log10(d[d.length - 1]) - Math.log10(d[0]))) *
      (W - L - R);
  const lo = -4,
    hi = 0; // 0.01% .. 100%
  const ys = (f: number) =>
    T + (1 - (Math.log10(Math.max(f, 1e-4)) - lo) / (hi - lo)) * (H - T - B);
  const yTicks = [1e-4, 1e-3, 1e-2, 1e-1, 1];
  const xTicks = [100, 300, 1000, 3000, 10000];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%">
      {yTicks.map((t) => (
        <g key={t}>
          <line className="gridline" x1={L} x2={W - R} y1={ys(t)} y2={ys(t)} />
          <text x={L - 6} y={ys(t) + 3} textAnchor="end">
            {t >= 0.01
              ? `${t * 100}%`
              : `${(t * 100).toFixed(t < 1e-3 ? 2 : 1)}%`}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={t}>
          <line className="gridline" x1={xs(t)} x2={xs(t)} y1={T} y2={H - B} />
          <text x={xs(t)} y={H - B + 14} textAnchor="middle">
            {fmtKm(t)}
          </text>
        </g>
      ))}
      <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <text x={(L + W) / 2} y={H - 4} textAnchor="middle">
        distance from touchdown (flat terrain)
      </text>
      {curves.series.map((s) => {
        const pts = s.damage[assetType]
          .map((f, i) => `${xs(d[i]).toFixed(1)},${ys(f).toFixed(1)}`)
          .join(" ");
        return (
          <polyline
            key={s.lander}
            points={pts}
            fill="none"
            stroke={LANDER_COLORS[s.lander]}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}

export default function Method({ meta }: { meta: Meta }) {
  const [curves, setCurves] = useState<Curves | null>(null);
  const [assetType, setAssetType] = useState("solar_array");
  useEffect(() => {
    api.curves().then(setCurves);
  }, []);
  const at = useMemo(
    () => meta.asset_types.find((t) => t.key === assetType)!,
    [meta, assetType],
  );

  return (
    <div className="page">
      <div className="page-inner">
        <h1>Method &amp; assumptions</h1>
        <p className="lede">
          How PLUME turns a landing plan into a damage estimate, what is AI and
          what is physics, and where the model is deliberately simple.
          Everything on this page is what the live product runs.
        </p>

        <div className="grid3">
          <div className="card">
            <h3>1 · Ejecta physics</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              The engine erodes regolith in proportion to thrust × low-altitude
              hover time. Grains leave at 0.3–12° in four size classes (dust →
              rocks) with log-normal speeds up to ~1.7 km/s. With no air on the
              Moon they fly on pure ballistic arcs and keep their speed. Terrain
              between the lander and a target blocks any arc that dips below the
              ground, which is why ridges shield assets.
            </p>
          </div>
          <div className="card">
            <h3>2 · Damage &amp; money</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              Three mechanisms per asset type: <b>erosion</b> (kinetic energy
              fluence), <b>impact</b> (gravel and rocks) and <b>dust coating</b>{" "}
              of optics and solar cells. Each saturates exponentially. Damage is
              averaged over the lander's landing dispersion and multiplied by
              the asset's registered value.
            </p>
          </div>
          <div className="card">
            <h3>3 · Search &amp; AI</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              The optimiser screens ~1,800 candidate sites (slope ≤ 8°, ≥ 300 m
              clearance), trading neighbour losses against surface-logistics
              cost, then re-scores the shortlist with dispersion. The AI copilot
              (Claude) explains results and drafts mitigations;{" "}
              <b>it never produces a safety number</b>.
            </p>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="row between" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Damage vs distance</h3>
              <select
                className="input"
                style={{ width: 170, padding: "5px 8px" }}
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
              >
                {meta.asset_types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {curves ? (
              <Chart curves={curves} assetType={assetType} />
            ) : (
              <p className="muted">Loading…</p>
            )}
            <div className="row wrap" style={{ gap: 14, marginTop: 6 }}>
              {curves?.series.map((s) => (
                <span key={s.lander} className="row" style={{ fontSize: 12 }}>
                  <span
                    className="dot"
                    style={{ background: LANDER_COLORS[s.lander] }}
                  />
                  {s.label}{" "}
                  <span className="faint mono">
                    {(s.eroded_mass_kg / 1000).toFixed(
                      s.eroded_mass_kg < 1000 ? 2 : 0,
                    )}{" "}
                    t eroded
                  </span>
                </span>
              ))}
            </div>
            <p className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
              {at.label}: erosion characteristic scale{" "}
              {at.erosion_50.toExponential(0)} J/m² · impact at {at.impact_50}{" "}
              J/m²
              {at.coating_50 !== null
                ? ` · coating at ${at.coating_50 * 1000} g/m²`
                : ""}
            </p>
          </div>

          <div className="stack" style={{ alignContent: "start" }}>
            <div className="card">
              <h3>Historical check · Apollo 12 → Surveyor 3</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                In 1969 Apollo 12 landed ~160 m from the Surveyor 3 probe. Parts
                returned to Earth were sandblasted and pitted by the descent
                plume. Chandrayaan-3 (2023) displaced ~2 t of regolith on
                touchdown.
              </p>
              {curves && (
                <dl className="kv">
                  <dt>PLUME, Apollo-class lander at 160 m</dt>
                  <dd>
                    {(curves.surveyor_check.energy_fluence_j_m2 / 1000).toFixed(
                      0,
                    )}{" "}
                    kJ/m²
                  </dd>
                  <dt>Fine particles on exposed face</dt>
                  <dd>
                    {curves.surveyor_check.fine_mass_g_m2.toFixed(0)} g/m²
                  </dd>
                  <dt>Eroded mass, illustrative Apollo-class scaling</dt>
                  <dd>~2 t</dd>
                </dl>
              )}
              <p className="faint" style={{ fontSize: 11.5, marginBottom: 0 }}>
                This illustrative calculation is not a quantitative validation
                against measured Surveyor damage.
              </p>
            </div>
            <div className="card">
              <h3>Known limitations</h3>
              <ul
                className="muted"
                style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}
              >
                <li>
                  Simplified plume: erosion rate and speed scaling are
                  illustrative assumptions, not CFD/DSMC-derived.
                </li>
                <li>
                  Flat-Moon ballistics (curvature ignored; error grows past ~100
                  km).
                </li>
                <li>
                  Damage sensitivities are engineering estimates, to be replaced
                  with test data.
                </li>
                <li>
                  Terrain is synthetic demo data; production would use LRO/LOLA
                  elevation models.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
