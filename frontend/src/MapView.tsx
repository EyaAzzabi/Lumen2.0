import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset, AssetResult, Footprint, Meta, Operator, Pt } from "./api";
import { RISK_COLOR, fmtKm } from "./api";

interface Props {
  meta: Meta;
  assets: Asset[];
  operators: Operator[];
  site: Pt | null;
  dispersion_m?: number;
  optimized?: Pt | null;
  siteLabel?: string;
  optimizedLabel?: string;
  footprint?: Footprint | null;
  results?: AssetResult[];
  searchPoints?: [number, number, number | null][] | null;
  onSiteChange?: (p: Pt) => void;
  onPick?: (p: Pt) => void;
  focusAssetId?: string | null;
  framing?: { points: Pt[]; tick: number };
  busy?: string | null;
  hint?: string | null;
}

interface View {
  cx: number;
  cy: number;
  s: number;
} // world centre (m) and pixels per metre

// Damage fraction -> RGBA. Matches the risk bands: 0.5% low, 3% elevated, 15% critical.
function rampColor(v: number): [number, number, number, number] {
  if (v < 0.001) return [0, 0, 0, 0];
  const stops: [number, [number, number, number], number][] = [
    [0.001, [250, 204, 21], 0.1],
    [0.005, [250, 204, 21], 0.34],
    [0.03, [251, 146, 60], 0.5],
    [0.15, [244, 63, 94], 0.62],
    [0.6, [190, 24, 93], 0.78],
  ];
  const lv = Math.log10(v);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca, aa] = stops[i];
    const [b, cb, ab] = stops[i + 1];
    if (v <= b) {
      const t = (lv - Math.log10(a)) / (Math.log10(b) - Math.log10(a));
      return [
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
        (aa + (ab - aa) * t) * 255,
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [...last[1], last[2] * 255] as [number, number, number, number];
}

const TYPE_GLYPH: Record<string, string> = {
  habitat: "H",
  solar_array: "S",
  isru_plant: "I",
  comms_relay: "R",
  telescope: "T",
  rover: "V",
};

export default function MapView(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 600, cy: -900, s: 0.06 });
  const [hover, setHover] = useState<Pt | null>(null);
  const [dragSite, setDragSite] = useState<Pt | null>(null);
  const drag = useRef<{
    mode: "pan" | "site";
    sx: number;
    sy: number;
    v: View;
    moved: boolean;
  } | null>(null);
  const [tick, setTick] = useState(0);

  const hill = useMemo(() => {
    const img = new Image();
    img.src = "/api/terrain/hillshade.png";
    img.onload = () => setTick((t) => t + 1);
    return img;
  }, []);

  const frameKey = JSON.stringify(p.framing);
  useEffect(() => {
    const points = p.framing?.points;
    if (!points?.length) return;
    const xs = points.map((q) => q.x),
      ys = points.map((q) => q.y);
    const xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys);
    setView({
      cx: (xmin + xmax) / 2,
      cy: (ymin + ymax) / 2,
      s:
        Math.min(
          size.w / Math.max(3000, xmax - xmin + 2000),
          size.h / Math.max(3000, ymax - ymin + 2000),
        ) * 0.8,
    });
  }, [frameKey, size.w, size.h]);

  // Footprint raster, row 0 = north.
  const fpCanvas = useMemo(() => {
    const f = p.footprint;
    if (!f) return null;
    const c = document.createElement("canvas");
    c.width = f.n;
    c.height = f.n;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(f.n, f.n);
    for (let r = 0; r < f.n; r++) {
      for (let col = 0; col < f.n; col++) {
        const v = f.values[r * f.n + col];
        const [R, G, B, A] = rampColor(v);
        const o = ((f.n - 1 - r) * f.n + col) * 4;
        img.data[o] = R;
        img.data[o + 1] = G;
        img.data[o + 2] = B;
        img.data[o + 3] = A;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [p.footprint]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Gentle pulse for critical assets.
  const anyCritical = p.results?.some((r) => r.risk === "critical");
  useEffect(() => {
    if (!anyCritical) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anyCritical]);

  useEffect(() => {
    if (!p.focusAssetId) return;
    const a = p.assets.find((x) => x.id === p.focusAssetId);
    if (a) setView((v) => ({ ...v, cx: a.x, cy: a.y }));
  }, [p.focusAssetId, p.assets]);

  const toScreen = useCallback(
    (x: number, y: number) => ({
      x: (x - view.cx) * view.s + size.w / 2,
      y: size.h / 2 - (y - view.cy) * view.s,
    }),
    [view, size],
  );
  const toWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - size.w / 2) / view.s + view.cx,
      y: (size.h / 2 - sy) / view.s + view.cy,
    }),
    [view, size],
  );

  const site = dragSite ?? p.site;

  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#020306";
    ctx.fillRect(0, 0, size.w, size.h);

    const t = p.meta.terrain;
    const tl = toScreen(t.x_min, t.y_max);
    const br = toScreen(t.x_max, t.y_min);
    if (hill.complete && hill.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(hill, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    // Subtle grid every km (or 5 km when zoomed out).
    const step = view.s > 0.04 ? 1000 : 5000;
    ctx.strokeStyle = "rgba(156,199,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = Math.ceil(t.x_min / step) * step; gx <= t.x_max; gx += step) {
      const a = toScreen(gx, 0).x;
      ctx.moveTo(a, tl.y);
      ctx.lineTo(a, br.y);
    }
    for (let gy = Math.ceil(t.y_min / step) * step; gy <= t.y_max; gy += step) {
      const a = toScreen(0, gy).y;
      ctx.moveTo(tl.x, a);
      ctx.lineTo(br.x, a);
    }
    ctx.stroke();

    // Footprint heat map (hidden while dragging: it belongs to the previous site).
    if (fpCanvas && p.footprint && !dragSite) {
      const f = p.footprint;
      const a = toScreen(f.x_min, f.y_max);
      const b = toScreen(f.x_max, f.y_min);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fpCanvas, a.x, a.y, b.x - a.x, b.y - a.y);
    }

    // Optimiser search candidates.
    if (p.searchPoints) {
      const costs = p.searchPoints
        .map((q) => q[2])
        .filter((c): c is number => c !== null);
      const lo = Math.min(...costs);
      const hi = Math.max(...costs);
      for (const [x, y, cst] of p.searchPoints) {
        const s = toScreen(x, y);
        if (cst === null) {
          ctx.fillStyle = "rgba(120,130,150,0.25)";
        } else {
          const tt = Math.sqrt((cst - lo) / Math.max(hi - lo, 1e-9));
          ctx.fillStyle = `rgba(${Math.round(94 + 150 * tt)},${Math.round(234 - 170 * tt)},${Math.round(212 - 120 * tt)},0.75)`;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Assets.
    const resById = new Map((p.results || []).map((r) => [r.asset_id, r]));
    const opById = new Map(p.operators.map((o) => [o.id, o]));
    const pulse = (Math.sin(performance.now() / 260) + 1) / 2;
    for (const a of p.assets) {
      const s = toScreen(a.x, a.y);
      const op = opById.get(a.operator_id);
      const r = resById.get(a.id);
      if (r && r.risk !== "negligible") {
        const col = RISK_COLOR[r.risk];
        ctx.strokeStyle = col;
        ctx.globalAlpha = r.risk === "critical" ? 0.35 + 0.5 * pulse : 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          s.x,
          s.y,
          15 + (r.risk === "critical" ? 6 * pulse : 0),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(5,7,12,0.85)";
      ctx.strokeStyle = op?.color || "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = op?.color || "#fff";
      ctx.font = "600 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(TYPE_GLYPH[a.type] || "?", s.x, s.y + 0.5);
      ctx.font = "500 11.5px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(2,3,6,0.85)";
      ctx.strokeText(a.name, s.x + 15, s.y - 1);
      ctx.fillStyle = "#e8edf5";
      ctx.fillText(a.name, s.x + 15, s.y - 1);
      if (r && r.risk !== "negligible") {
        ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.strokeText(r.risk.toUpperCase(), s.x + 15, s.y + 12);
        ctx.fillStyle = RISK_COLOR[r.risk];
        ctx.fillText(r.risk.toUpperCase(), s.x + 15, s.y + 12);
      }
    }

    // Optimised site and the move from the requested site.
    if (site && p.optimized) {
      const a = toScreen(site.x, site.y);
      const b = toScreen(p.optimized.x, p.optimized.y);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(156,199,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const d = Math.hypot(p.optimized.x - site.x, p.optimized.y - site.y);
      ctx.font = "600 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#9cc7ff";
      ctx.textAlign = "center";
      ctx.fillText(fmtKm(d), (a.x + b.x) / 2, (a.y + b.y) / 2 - 8);
      drawMarker(ctx, b.x, b.y, "#9cc7ff", p.optimizedLabel ?? "CANDIDATE");
    }
    if (site) {
      const s = toScreen(site.x, site.y);
      if (p.dispersion_m) {
        ctx.strokeStyle = "rgba(242,194,123,0.55)";
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
          s.x,
          s.y,
          Math.max(3 * p.dispersion_m * view.s, 6),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawMarker(
        ctx,
        s.x,
        s.y,
        "#f2c27b",
        p.siteLabel ?? (p.optimized ? "INITIAL SITE" : "TOUCHDOWN"),
      );
    }

    // Scale bar.
    const target = 120 / view.s;
    const mag = Math.pow(10, Math.floor(Math.log10(target)));
    const nice =
      [1, 2, 5, 10]
        .map((m) => m * mag)
        .filter((v) => v <= target)
        .pop() || mag;
    const px = nice * view.s;
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, size.h - 22);
    ctx.lineTo(18 + px, size.h - 22);
    ctx.moveTo(18, size.h - 27);
    ctx.lineTo(18, size.h - 17);
    ctx.moveTo(18 + px, size.h - 27);
    ctx.lineTo(18 + px, size.h - 17);
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(fmtKm(nice), 24 + px, size.h - 22);
    // North arrow.
    ctx.textAlign = "center";
    ctx.fillText("N", size.w - 24, 22);
    ctx.beginPath();
    ctx.moveTo(size.w - 24, 30);
    ctx.lineTo(size.w - 29, 44);
    ctx.lineTo(size.w - 19, 44);
    ctx.closePath();
    ctx.fill();
  }, [p, size, view, hill, fpCanvas, tick, site, dragSite, toScreen]);

  function drawMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    label: string,
  ) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 13, y);
    ctx.moveTo(x + 13, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 13);
    ctx.moveTo(x, y + 13);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
    ctx.font = "700 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(2,3,6,0.9)";
    ctx.strokeText(label, x, y + 31);
    ctx.fillText(label, x, y + 31);
  }

  function local(e: React.MouseEvent | React.WheelEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  function onMouseDown(e: React.MouseEvent) {
    const { sx, sy } = local(e);
    let mode: "pan" | "site" = "pan";
    if (p.site && p.onSiteChange) {
      const s = toScreen(p.site.x, p.site.y);
      if (Math.hypot(s.x - sx, s.y - sy) < 16) mode = "site";
    }
    drag.current = { mode, sx, sy, v: view, moved: false };
  }
  function onMouseMove(e: React.MouseEvent) {
    const { sx, sy } = local(e);
    setHover(toWorld(sx, sy));
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.mode === "pan") {
      setView({
        ...d.v,
        cx: d.v.cx - (sx - d.sx) / d.v.s,
        cy: d.v.cy + (sy - d.sy) / d.v.s,
      });
    } else {
      setDragSite(toWorld(sx, sy));
    }
  }
  function onMouseUp(e: React.MouseEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const { sx, sy } = local(e);
    const w = toWorld(sx, sy);
    if (d.mode === "site" && d.moved) {
      setDragSite(null);
      p.onSiteChange?.(w);
    } else if (!d.moved) {
      if (p.onPick) p.onPick(w);
      else p.onSiteChange?.(w);
    }
  }
  function onWheel(e: React.WheelEvent) {
    const { sx, sy } = local(e);
    const before = toWorld(sx, sy);
    const s = Math.min(
      0.6,
      Math.max(0.018, view.s * Math.exp(-e.deltaY * 0.0015)),
    );
    setView({
      s,
      cx: before.x - (sx - size.w / 2) / s,
      cy: before.y + (sy - size.h / 2) / s,
    });
  }

  return (
    <div className="map" ref={wrap}>
      <canvas
        ref={canvas}
        style={{
          width: size.w,
          height: size.h,
          cursor: drag.current?.mode === "site" ? "grabbing" : "crosshair",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          drag.current = null;
          setDragSite(null);
          setHover(null);
        }}
        onWheel={onWheel}
      />
      <div className="map-readout mono">
        {hover
          ? `E ${(hover.x / 1000).toFixed(2)} km · N ${(hover.y / 1000).toFixed(2)} km`
          : p.meta.terrain.label}
      </div>
      {p.busy && (
        <div className="map-busy">
          <span className="spin" />
          {p.busy}
        </div>
      )}
      {p.hint && <div className="map-hint">{p.hint}</div>}
      {p.footprint && (
        <div className="map-legend">
          <div className="legend-title">Damage to a reference solar array</div>
          <div className="legend-bar" />
          <div className="legend-ticks mono">
            <span>0.1%</span>
            <span>0.5%</span>
            <span>3%</span>
            <span>15%</span>
            <span>60%+</span>
          </div>
        </div>
      )}
    </div>
  );
}
