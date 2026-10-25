export type Risk = "negligible" | "low" | "elevated" | "critical";

export interface Operator {
  id: string;
  name: string;
  short: string;
  color: string;
}
export interface Asset {
  id: string;
  operator_id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  value_meur: number;
  height_m?: number;
}
export interface LanderPreset {
  id: string;
  label: string;
  thrust_kn: number;
  hover_s: number;
  dispersion_m: number;
  note: string;
  max_range_m: number;
}
export interface LanderParams {
  label: string;
  thrust_kn: number;
  hover_s: number;
  dispersion_m: number;
}
export interface Pt {
  x: number;
  y: number;
}
export interface TerrainMesh {
  n: number;
  size_m: number;
  x_min: number;
  y_min: number;
  step_m: number;
  label: string;
  elevations_m: number[];
}

export interface AssetType {
  key: string;
  label: string;
  default_height_m: number;
  erosion_50: number;
  impact_50: number;
  coating_50: number | null;
}
export interface Meta {
  terrain: {
    size_m: number;
    res_m: number;
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
    label: string;
  };
  landers: LanderPreset[];
  asset_types: AssetType[];
}

export interface AssetResult {
  asset_id: string;
  distance_m: number;
  shielded: boolean;
  damage_fraction: number;
  mechanisms: { erosion: number; impact: number; coating: number };
  expected_loss_meur: number;
  risk: Risk;
  energy_fluence_j_m2: number;
  dust_mass_g_m2: number;
  uncertainty?: {
    q95: number;
    worst_sample_damage: number;
    valid_samples: number;
    seed: number;
  };
}
export interface Assessment {
  site: Pt & { elevation_m: number; slope_deg: number };
  assets: AssetResult[];
  summary: {
    expected_loss_meur: number;
    worst_asset_id: string | null;
    worst_risk: Risk;
    assets_at_risk: number;
  };
  provenance?: { model_version: string; validation: string };
  uncertainty?: {
    valid_samples: number;
    excluded_samples: number;
    seed: number;
  };
  compute_ms: number;
}
export interface Footprint {
  n: number;
  radius_m: number;
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  values: number[];
  reference: string;
  compute_ms: number;
  valid_mask?: boolean[];
  metadata?: Record<string, unknown>;
}
export interface Alternative {
  worst_risk: Risk;
  worst_damage_fraction: number;
  assets_at_risk: number;
  nearest_asset_m: number | null;
  x: number;
  y: number;
  expected_loss_meur: number;
  traverse_meur: number;
  total_cost_meur: number;
  distance_from_target_m: number;
  slope_deg: number;
}
export interface Optimization {
  target: Assessment;
  best: Assessment | null;
  best_traverse_meur: number | null;
  alternatives: Alternative[];
  search: {
    candidates: number;
    feasible: number;
    radius_m: number;
    step_m: number;
    points: [number, number, number | null][];
  };
  best_explanation?: Alternative & {
    worst_risk: string;
    nearest_asset_m: number;
    explanation: Record<string, unknown>;
  };
  method?: { strategy: string; rescored: number; refined_count: number };
  compute_ms: number;
}
export interface Brief {
  markdown: string;
  source: "claude" | "template";
  model?: string;
  reason?: string;
  latency_ms: number;
}
export interface Plan {
  id: string;
  operator_id: string;
  name: string;
  window: string;
  lander: LanderParams;
  site: Pt;
  summary: Assessment["summary"];
  status: string;
  created_at: number;
  revision?: number;
  revision_id?: string;
  window_start?: string;
  window_end?: string;
}
export interface Notice {
  id: string;
  plan_id: string;
  from_operator_id: string;
  to_operator_id: string;
  asset_ids: string[];
  max_risk: Risk;
  expected_loss_meur: number;
  subject: string;
  body: string;
  status: "unread" | "acknowledged" | "objection";
  reply?: string;
  created_at: number;
  revision?: number;
  revision_id?: string;
  read_at?: number;
  responded_at?: number;
  response_history?: {
    status: string;
    reply?: string;
    created_at?: number;
    organization_id?: string;
  }[];
}
export interface Curves {
  distance_m: number[];
  series: {
    lander: string;
    label: string;
    eroded_mass_kg: number;
    damage: Record<string, number[]>;
  }[];
  surveyor_check: {
    distance_m: number;
    energy_fluence_j_m2: number;
    fine_mass_g_m2: number;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  operator_id: string;
  role: "admin" | "member";
  demo: boolean;
}
export interface Organization extends Operator {
  invite_code?: string;
}
export interface DemoAccount {
  email: string;
  organization: string;
  operator_id: string;
  password: string;
}
export interface AuthSession extends Session {
  user: User;
  organization: Organization;
}
export interface Session {
  user?: User;
  organization?: Organization;
  authenticated: boolean;
  demo_enabled: boolean;
  organization_id?: string;
  csrf_token?: string;
  permissions: string[];
  roles: string[];
}
export interface PlanDetail {
  plan: Plan;
  revisions: (Plan & {
    historical_assessment: {
      assessment?: Assessment;
      provenance?: Record<string, unknown>;
      legacy?: boolean;
    };
  })[];
  notices: Notice[];
  events: {
    id: string;
    type: string;
    created_at: number;
    actor_id: string;
    revision_id: string;
  }[];
  coordination: { status: string; safety_certification: boolean };
}
let session: Session | null = null;
let unauthorized: (() => void) | null = null;
const pendingKeys = new Map<string, string>();
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60_000);
  const mutating = init?.method && !["GET", "HEAD"].includes(init.method);
  const signature = `${session?.organization_id}:${init?.method}:${path}:${init?.body}`;
  const idem =
    mutating &&
    (path === "/api/plans" ||
      path.includes("/revisions") ||
      init?.method === "PATCH");
  if (idem && !pendingKeys.has(signature))
    pendingKeys.set(signature, crypto.randomUUID());
  try {
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(path, {
        ...init,
        signal: controller.signal,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(session?.csrf_token
            ? { "X-Plume-CSRF": session.csrf_token }
            : {}),
          ...(idem ? { "Idempotency-Key": pendingKeys.get(signature)! } : {}),
          ...(init?.headers || {}),
        },
      });
      if (
        res.status !== 429 ||
        !["/api/assess", "/api/footprint", "/api/optimize"].includes(path) ||
        attempt >= 5
      )
        break;
      await res.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const e = await res.json();
        detail =
          JSON.stringify(e.detail) + (e.request_id ? ` [${e.request_id}]` : "");
      } catch {
        /* status text */
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 409)
        pendingKeys.delete(signature);
      if (
        res.status === 401 &&
        session?.authenticated &&
        !path.startsWith("/api/auth/login")
      ) {
        session = null;
        unauthorized?.();
      }
      throw new Error(`${res.status} ${detail}`);
    }
    if (idem) pendingKeys.delete(signature);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}
const post = <T>(path: string, body: unknown) =>
  req<T>(path, { method: "POST", body: JSON.stringify(body) });
const filedBody = (p: { window: string; [key: string]: unknown }) => {
  const dates = p.window.split(" / ");
  return dates.length === 2
    ? { ...p, window_start: dates[0], window_end: dates[1] }
    : p;
};

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  joined_at: number;
  demo: boolean;
}

export const api = {
  members: () => req<Member[]>("/api/organization/members"),
  onUnauthorized: (callback: () => void) => {
    unauthorized = callback;
  },
  session: async () => {
    session = await req<Session>("/api/session");
    return session;
  },
  login: async (email: string, password: string) => {
    session = await post<AuthSession>("/api/auth/login", { email, password });
    return session as AuthSession;
  },
  signup: async (body: {
    name: string;
    email: string;
    password: string;
    organization: "create" | "join";
    organization_name?: string;
    invite_code?: string;
  }) => {
    session = await post<AuthSession>("/api/auth/signup", body);
    return session as AuthSession;
  },
  me: async () => {
    session = await req<Session>("/api/auth/me");
    return session;
  },
  logout: async () => {
    const result = await post<{ ok: boolean }>("/api/auth/logout", {});
    session = null;
    return result;
  },
  demoAccounts: () => req<DemoAccount[]>("/api/auth/demo-accounts"),
  demoSession: async (operator_id: string) => {
    const accounts = await req<DemoAccount[]>("/api/auth/demo-accounts");
    const account = accounts.find((a) => a.operator_id === operator_id);
    if (!account)
      throw new Error("This organization requires its own account credentials");
    session = await post<AuthSession>("/api/auth/login", {
      email: account.email,
      password: account.password,
    });
    return session as AuthSession;
  },
  planDetail: (id: string) => req<PlanDetail>(`/api/plans/${id}`),
  revisePlan: (
    id: string,
    p: {
      lander: LanderParams;
      site: Pt;
      operator_id: string;
      name: string;
      window: string;
      expected_revision: number;
    },
  ) =>
    post<{ plan: Plan; notices_sent: number }>(
      `/api/plans/${id}/revisions`,
      filedBody(p),
    ),
  reassessPlan: (id: string) =>
    post<Assessment>(`/api/plans/${id}/reassess`, {}),
  withdrawPlan: (id: string) => post<Plan>(`/api/plans/${id}/withdraw`, {}),
  readNotice: (id: string) => post<Notice>(`/api/notices/${id}/read`, {}),
  meta: () => req<Meta>("/api/meta"),
  terrainMesh: () => req<TerrainMesh>("/api/terrain/mesh"),
  operators: () => req<Operator[]>("/api/operators"),
  assets: () => req<Asset[]>("/api/assets"),
  addAsset: (a: Omit<Asset, "id">) => post<Asset>("/api/assets", a),
  deleteAsset: (id: string) =>
    req<{ ok: boolean }>(`/api/assets/${id}`, { method: "DELETE" }),
  assess: (lander: LanderParams, site: Pt) =>
    post<Assessment>("/api/assess", { lander, site }),
  footprint: (lander: LanderParams, site: Pt) =>
    post<Footprint>("/api/footprint", { lander, site }),
  optimize: (lander: LanderParams, site: Pt, opts: Record<string, number>) =>
    post<Optimization>("/api/optimize", { lander, site, ...opts }),
  brief: (lander: LanderParams, site: Pt, optimized_site: Pt | null) =>
    post<Brief>("/api/copilot/brief", {
      lander,
      site: { x: site.x, y: site.y },
      optimized_site: optimized_site
        ? { x: optimized_site.x, y: optimized_site.y }
        : null,
    }),
  plans: () => req<Plan[]>("/api/plans"),
  submitPlan: (p: {
    lander: LanderParams;
    site: Pt;
    operator_id: string;
    name: string;
    window: string;
  }) => post<{ plan: Plan; notices_sent: number }>("/api/plans", filedBody(p)),
  notices: (operator_id: string) =>
    req<Notice[]>(`/api/notices?operator_id=${operator_id}`),
  updateNotice: (
    id: string,
    status: "acknowledged" | "objection",
    reply?: string,
  ) =>
    req<Notice>(`/api/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, reply }),
    }),
  curves: () => req<Curves>("/api/curves"),
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
export const fmtKm = (m: number) =>
  m >= 1000
    ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`
    : `${m.toFixed(0)} m`;
export const fmtPct = (f: number) =>
  f >= 0.1
    ? `${(f * 100).toFixed(0)}%`
    : f >= 0.001
      ? `${(f * 100).toFixed(1)}%`
      : `${(f * 100).toFixed(2)}%`;
