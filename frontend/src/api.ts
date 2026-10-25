export type Risk = "negligible" | "low" | "elevated" | "critical";

export interface Operator { id: string; name: string; short: string; color: string }
export interface Asset {
  id: string; operator_id: string; name: string; type: string;
  x: number; y: number; value_meur: number; height_m?: number;
}
export interface LanderPreset {
  id: string; label: string; thrust_kn: number; hover_s: number; dispersion_m: number; note: string;
  max_range_m: number;
}
export interface LanderParams { label: string; thrust_kn: number; hover_s: number; dispersion_m: number }
export interface Pt { x: number; y: number }
export interface TerrainMesh {
  n: number; size_m: number; x_min: number; y_min: number; step_m: number;
  label: string; elevations_m: number[];
}

export interface AssetType {
  key: string; label: string; default_height_m: number;
  erosion_50: number; impact_50: number; coating_50: number | null;
}
export interface Meta {
  terrain: { size_m: number; res_m: number; x_min: number; x_max: number; y_min: number; y_max: number; label: string };
  landers: LanderPreset[];
  asset_types: AssetType[];
}

export interface AssetResult {
  asset_id: string; distance_m: number; shielded: boolean; damage_fraction: number;
  mechanisms: { erosion: number; impact: number; coating: number };
  expected_loss_meur: number; risk: Risk; energy_fluence_j_m2: number; dust_mass_g_m2: number;
}
export interface Assessment {
  site: Pt & { elevation_m: number; slope_deg: number };
  assets: AssetResult[];
  summary: { expected_loss_meur: number; worst_asset_id: string | null; worst_risk: Risk; assets_at_risk: number };
  compute_ms: number;
}
export interface Footprint {
  n: number; radius_m: number; x_min: number; x_max: number; y_min: number; y_max: number;
  values: number[]; reference: string; compute_ms: number;
}
export interface Alternative {
  x: number; y: number; expected_loss_meur: number; traverse_meur: number; total_cost_meur: number;
  distance_from_target_m: number; slope_deg: number;
  worst_risk: Risk; worst_damage_fraction: number; assets_at_risk: number; nearest_asset_m: number | null;
}
export interface Optimization {
  target: Assessment; best: Assessment | null; best_traverse_meur: number | null; alternatives: Alternative[];
  search: { candidates: number; feasible: number; radius_m: number; step_m: number; points: [number, number, number | null][] };
  compute_ms: number;
}
export interface Brief { markdown: string; source: "claude" | "template"; model?: string; reason?: string; latency_ms: number }
export interface Plan {
  id: string; operator_id: string; name: string; window: string; lander: LanderParams; site: Pt;
  summary: Assessment["summary"]; status: string; created_at: number;
}
export interface Notice {
  id: string; plan_id: string; from_operator_id: string; to_operator_id: string; asset_ids: string[];
  max_risk: Risk; expected_loss_meur: number; subject: string; body: string;
  status: "unread" | "acknowledged" | "objection"; reply?: string; created_at: number;
}
export interface Curves {
  distance_m: number[];
  series: { lander: string; label: string; eroded_mass_kg: number; damage: Record<string, number[]> }[];
  surveyor_check: { distance_m: number; energy_fluence_j_m2: number; fine_mass_g_m2: number };
}

export interface User { id: string; email: string; name: string; operator_id: string; role: "admin" | "member"; demo: boolean }
export interface Organization extends Operator { invite_code?: string }
export interface Session { user: User; organization: Organization; token?: string }
export interface DemoAccount { email: string; organization: string; operator_id: string; password: string }

const TOKEN_KEY = "plume.session";
let token: string | null = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage unavailable: session lasts for this tab */ }
let onUnauthorized: (() => void) | null = null;

export const session = {
  token: () => token,
  set(t: string | null) {
    token = t;
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
  onUnauthorized(fn: () => void) { onUnauthorized = fn; },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const d = (await res.json()).detail;
      detail = typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => e.msg).join("; ") : JSON.stringify(d);
    } catch { /* keep status text */ }
    if (res.status === 401 && token && !path.startsWith("/api/auth/login")) {
      session.set(null);
      onUnauthorized?.();
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}
const post = <T,>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  login: (email: string, password: string) => post<Session>("/api/auth/login", { email, password }),
  signup: (body: { name: string; email: string; password: string; organization: "create" | "join"; organization_name?: string; invite_code?: string }) =>
    post<Session>("/api/auth/signup", body),
  me: () => req<Session>("/api/auth/me"),
  logout: () => post<{ ok: boolean }>("/api/auth/logout", {}),
  demoAccounts: () => req<DemoAccount[]>("/api/auth/demo-accounts"),
  meta: () => req<Meta>("/api/meta"),
  terrainMesh: () => req<TerrainMesh>("/api/terrain/mesh"),
  operators: () => req<Operator[]>("/api/operators"),
  assets: () => req<Asset[]>("/api/assets"),
  addAsset: (a: Omit<Asset, "id">) => post<Asset>("/api/assets", a),
  deleteAsset: (id: string) => req<{ ok: boolean }>(`/api/assets/${id}`, { method: "DELETE" }),
  assess: (lander: LanderParams, site: Pt) => post<Assessment>("/api/assess", { lander, site }),
  footprint: (lander: LanderParams, site: Pt) => post<Footprint>("/api/footprint", { lander, site }),
  optimize: (lander: LanderParams, site: Pt, opts: Record<string, number>) =>
    post<Optimization>("/api/optimize", { lander, site, ...opts }),
  brief: (lander: LanderParams, site: Pt, optimized_site: Pt | null) =>
    post<Brief>("/api/copilot/brief", { lander, site, optimized_site }),
  plans: () => req<Plan[]>("/api/plans"),
  submitPlan: (p: { lander: LanderParams; site: Pt; operator_id?: string; name: string; window: string }) =>
    post<{ plan: Plan; notices_sent: number }>("/api/plans", p),
  notices: (_operator_id?: string) => req<Notice[]>("/api/notices"),
  updateNotice: (id: string, status: "acknowledged" | "objection", reply?: string) =>
    req<Notice>(`/api/notices/${id}`, { method: "PATCH", body: JSON.stringify({ status, reply }) }),
  curves: () => req<Curves>("/api/curves"),
  reset: () => post<{ ok: boolean }>("/api/reset", {}),
};

export const RISK_COLOR: Record<Risk, string> = {
  negligible: "#35D7A0",
  low: "#E9BD83",
  elevated: "#FF9D4A",
  critical: "#FF684A",
};

export function fmtMeur(x: number): string {
  if (x >= 100) return `€${x.toFixed(0)}M`;
  if (x >= 10) return `€${x.toFixed(1)}M`;
  if (x >= 0.01) return `€${x.toFixed(2)}M`;
  if (x > 0) return `€${(x * 1000).toFixed(0)}k`;
  return "€0";
}
export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${m.toFixed(0)} m`);
export const fmtPct = (f: number) => (f >= 0.1 ? `${(f * 100).toFixed(0)}%` : f >= 0.001 ? `${(f * 100).toFixed(1)}%` : `${(f * 100).toFixed(2)}%`);
