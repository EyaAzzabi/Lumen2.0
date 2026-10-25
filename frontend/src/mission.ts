import { create } from "zustand";
import {
  api,
  type Assessment,
  type Asset,
  type Brief,
  type Footprint,
  type LanderParams,
  type Meta,
  type Notice,
  type Operator,
  type Optimization,
  type Plan,
  type Pt,
  type TerrainMesh,
  type User,
  type Organization,
  type DemoAccount,
  session,
} from "./api";

export type Mode =
  | "gateway"
  | "login"
  | "pricing"
  | "setup"
  | "operations"
  | "simulation"
  | "replay"
  | "optimizer"
  | "report"
  | "notices"
  | "registry"
  | "method";
export const PUBLIC_MODES: Mode[] = ["gateway", "login", "pricing", "method"];
export type CameraView = "overview" | "top" | "site" | "asset" | "lander";
export type Layers = Record<
  "terrain" | "infrastructure" | "zones" | "hazard" | "candidates",
  boolean
>;
export const DEFAULT_SITE = { x: 1500, y: -1500 };
export const REPLAY_DURATION = 24;
export const phaseAt = (t: number) =>
  t < 4
    ? "Approach"
    : t < 7
      ? "Engine ignition"
      : t < 12
        ? "Final descent"
        : t < 15
          ? "Touchdown"
          : t < 21
            ? "Particle dispersion"
            : "Risk assessment";

interface Mission {
  mode: Mode;
  user: User | null;
  organization: Organization | null;
  authChecked: boolean;
  afterLogin: Mode;
  demoAccounts: DemoAccount[];
  meta: Meta | null;
  terrain: TerrainMesh | null;
  assets: Asset[];
  operators: Operator[];
  connected: boolean;
  loadError: string | null;
  terrainError: string | null;
  lander: LanderParams;
  presetId: string;
  site: Pt;
  revision: number;
  missionName: string;
  window: string;
  actingId: string;
  plans: Plan[];
  notices: Notice[];
  coordinationError: string | null;
  registryFilter: { operator: string; type: string; region: string };
  assessment: Assessment | null;
  footprint: Footprint | null;
  optimization: Optimization | null;
  brief: Brief | null;
  assessedAt: string | null;
  busy: "analysis" | "optimizer" | "brief" | "submit" | null;
  error: string | null;
  toast: string | null;
  refreshKey: number;
  selectedAsset: string | null;
  placeMode: boolean;
  cameraView: CameraView;
  cameraTick: number;
  layers: Layers;
  lowGraphics: boolean;
  reducedMotion: boolean;
  replay: number;
  playing: boolean;
  speed: number;
  demo: boolean;
  demoStep: number;
  demoPlanId: string | null;
  demoRecipient: string | null;
  searchRadius: number;
  traverseCost: number;
  maxSlope: number;
  clearance: number;
  setMode: (mode: Mode) => void;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  switchOperator: (id: string) => Promise<boolean>;
  restoreSession: () => Promise<void>;
  applySession: (r: { user: User; organization: Organization }) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: Parameters<typeof api.signup>[0]) => Promise<void>;
  signOut: () => Promise<void>;
  updateLander: (patch: Partial<LanderParams>, presetId?: string) => void;
  moveSite: (site: Pt, preserveOptimization?: boolean) => void;
  focus: (view: CameraView) => void;
  selectAsset: (id: string | null) => void;
  analyze: () => Promise<boolean>;
  optimize: () => Promise<void>;
  generateBrief: () => Promise<void>;
  simulate: () => Promise<void>;
  filePlan: () => Promise<string | null>;
  notify: (text: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout>;
export const useMission = create<Mission>((set, get) => ({
  mode: "gateway",
  user: null,
  organization: null,
  authChecked: false,
  afterLogin: "operations",
  demoAccounts: [],
  meta: null,
  terrain: null,
  assets: [],
  operators: [],
  connected: false,
  loadError: null,
  terrainError: null,
  lander: {
    label: "Super-heavy lander",
    thrust_kn: 1800,
    hover_s: 30,
    dispersion_m: 50,
  },
  presetId: "superheavy",
  site: DEFAULT_SITE,
  revision: 0,
  missionName: "KLL Cargo-7",
  window: "2040-03-14 06:00–08:00 UTC",
  actingId: "kestrel",
  plans: [],
  notices: [],
  coordinationError: null,
  registryFilter: { operator: "all", type: "all", region: "all" },
  assessment: null,
  footprint: null,
  optimization: null,
  brief: null,
  assessedAt: null,
  busy: null,
  error: null,
  toast: null,
  refreshKey: 0,
  selectedAsset: null,
  placeMode: false,
  cameraView: "overview",
  cameraTick: 0,
  layers: {
    terrain: true,
    infrastructure: true,
    zones: true,
    hazard: true,
    candidates: true,
  },
  lowGraphics: false,
  reducedMotion:
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  replay: 0,
  playing: false,
  speed: 1,
  demo: false,
  demoStep: 0,
  demoPlanId: null,
  demoRecipient: null,
  searchRadius: 4000,
  traverseCost: 2,
  maxSlope: 8,
  clearance: 300,
  setMode: (requested) => {
    let mode = requested;
    if (!get().user && !PUBLIC_MODES.includes(requested)) {
      set({ afterLogin: requested });
      mode = "login";
    }
    const previous = get().mode;
    set({ mode, placeMode: false });
    history.replaceState(null, "", `#${mode}`);
    if (mode === "gateway") set({ playing: false });
    if (mode === "setup") get().focus("lander");
    else if (previous === "gateway" || previous === "setup")
      get().focus("overview");
  },
  load: async () => {
    set({ loadError: null });
    try {
      const [meta, assets, operators] = await Promise.all([
        api.meta(),
        api.assets(),
        api.operators(),
      ]);
      set({ meta, assets, operators, connected: true });
      await get().restoreSession();
    } catch (e) {
      set({
        connected: false,
        loadError: `Mission data unavailable. ${String(e)}`,
      });
    }
    try {
      set({ terrain: await api.terrainMesh(), terrainError: null });
    } catch {
      set({
        terrainError: "3D terrain unavailable. The 2D map remains operational.",
      });
    }
  },
  refresh: async () => {
    const actingId = get().actingId;
    try {
      const signedIn = !!get().user;
      const [assets, plans, notices, operators] = await Promise.all([
        api.assets(),
        signedIn ? api.plans() : Promise.resolve([] as Plan[]),
        signedIn ? api.notices(actingId) : Promise.resolve([] as Notice[]),
        api.operators(),
      ]);
      if (get().actingId !== actingId) return;
      const changed = JSON.stringify(assets) !== JSON.stringify(get().assets);
      set((s) => ({
        assets,
        operators,
        plans,
        notices,
        coordinationError: null,
        refreshKey: s.refreshKey + 1,
        ...(changed
          ? {
              revision: s.revision + 1,
              assessment: null,
              footprint: null,
              optimization: null,
              brief: null,
              playing: false,
              busy: null,
            }
          : {}),
      }));
    } catch (e) {
      if (get().actingId === actingId)
        set({
          coordinationError: `Coordination data unavailable: ${String(e)}`,
        });
    }
  },
  switchOperator: async (actingId) => {
    if (actingId === get().actingId && get().user) return true;
    // Switching organisation is a real sign-in. Only the seeded demo organisations
    // have published demo credentials; the guided demo walkthrough uses them.
    let accounts = get().demoAccounts;
    if (!accounts.length) {
      try {
        accounts = await api.demoAccounts();
        set({ demoAccounts: accounts });
      } catch {
        accounts = [];
      }
    }
    const acc = accounts.find((a) => a.operator_id === actingId);
    if (!acc) {
      get().notify("Sign in with an account of that organization to act on its behalf.");
      return false;
    }
    try {
      await get().signIn(acc.email, acc.password);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
  restoreSession: async () => {
    if (session.token()) {
      try {
        const me = await api.me();
        set({ user: me.user, organization: me.organization, actingId: me.user.operator_id });
      } catch {
        session.set(null);
        set({ user: null, organization: null });
      }
    }
    set({ authChecked: true });
    if (!get().user && !PUBLIC_MODES.includes(get().mode)) get().setMode(get().mode);
    void get().refresh();
  },
  applySession: (r) => {
    set((s) => ({
      user: r.user,
      organization: r.organization,
      actingId: r.user.operator_id,
      notices: [],
      coordinationError: null,
      selectedAsset: null,
      registryFilter: {
        ...s.registryFilter,
        operator: s.registryFilter.operator === s.actingId ? r.user.operator_id : s.registryFilter.operator,
      },
    }));
    void get().refresh();
  },
  signIn: async (email, password) => {
    const r = await api.login(email, password);
    session.set(r.token!);
    get().applySession(r);
  },
  signUp: async (body) => {
    const r = await api.signup(body);
    session.set(r.token!);
    get().applySession(r);
  },
  signOut: async () => {
    try {
      await api.logout();
    } catch {
      /* token already invalid */
    }
    session.set(null);
    set({ user: null, organization: null, notices: [], plans: [], demo: false, selectedAsset: null });
    get().setMode("gateway");
  },
  updateLander: (patch, presetId = "custom") =>
    set((s) => ({
      lander: { ...s.lander, ...patch },
      presetId,
      revision: s.revision + 1,
      assessment: null,
      footprint: null,
      optimization: null,
      brief: null,
      assessedAt: null,
      error: null,
      playing: false,
      replay: 0,
      busy: null,
    })),
  moveSite: (p, preserveOptimization = false) => {
    const m = get().meta?.terrain;
    const site = {
      x: Math.max(m?.x_min ?? -15000, Math.min(m?.x_max ?? 15000, p.x)),
      y: Math.max(m?.y_min ?? -15000, Math.min(m?.y_max ?? 15000, p.y)),
    };
    set((s) => ({
      site,
      revision: s.revision + 1,
      assessment: null,
      footprint: null,
      optimization: preserveOptimization ? s.optimization : null,
      brief: null,
      assessedAt: null,
      error: null,
      playing: false,
      replay: 0,
      busy: null,
      placeMode: false,
    }));
  },
  focus: (cameraView) =>
    set((s) => ({ cameraView, cameraTick: s.cameraTick + 1 })),
  selectAsset: (selectedAsset) => {
    set({ selectedAsset });
    if (selectedAsset) get().focus("asset");
  },
  analyze: async () => {
    const { lander, site, revision, connected } = get();
    if (!connected) return false;
    set({ busy: "analysis", error: null, assessment: null, footprint: null });
    try {
      const [assessment, footprint] = await Promise.all([
        api.assess(lander, site),
        api.footprint(lander, site),
      ]);
      if (get().revision !== revision) return false;
      set({
        assessment,
        footprint,
        assessedAt: new Date().toISOString(),
        busy: null,
      });
      return true;
    } catch (e) {
      if (get().revision === revision)
        set({ error: `Assessment failed: ${String(e)}`, busy: null });
      return false;
    }
  },
  optimize: async () => {
    const {
      lander,
      site,
      revision,
      searchRadius,
      traverseCost,
      maxSlope,
      clearance,
    } = get();
    set({ busy: "optimizer", error: null, optimization: null });
    try {
      const optimization = await api.optimize(lander, site, {
        search_radius_m: searchRadius,
        traverse_meur_per_km: traverseCost,
        max_slope_deg: maxSlope,
        clearance_m: clearance,
      });
      if (get().revision === revision) {
        set({
          optimization,
          busy: null,
          layers: { ...get().layers, candidates: true },
        });
        get().focus("overview");
      }
    } catch (e) {
      if (get().revision === revision)
        set({ error: `Optimizer failed: ${String(e)}`, busy: null });
    }
  },
  generateBrief: async () => {
    const { lander, site, optimization, revision } = get();
    set({ busy: "brief", error: null });
    try {
      const brief = await api.brief(
        lander,
        optimization?.target.site ?? site,
        optimization?.best?.site ?? null,
      );
      if (get().revision === revision) set({ brief, busy: null });
    } catch (e) {
      if (get().revision === revision) set({ error: String(e), busy: null });
    }
  },
  simulate: async () => {
    get().setMode("simulation");
    const revision = get().revision;
    const ok =
      get().assessment && get().footprint ? true : await get().analyze();
    if (ok && revision === get().revision) {
      set({
        replay: get().reducedMotion ? REPLAY_DURATION : 0,
        playing: !get().reducedMotion,
        layers: { ...get().layers, hazard: true },
      });
      get().focus("site");
    }
  },
  filePlan: async () => {
    const { lander, site, actingId, missionName, window, revision } = get();
    if (!get().assessment || !missionName.trim() || !window.trim()) return null;
    set({ busy: "submit", error: null });
    try {
      const r = await api.submitPlan({
        lander,
        site,
        operator_id: actingId,
        name: missionName,
        window,
      });
      if (get().revision === revision) set({ busy: null });
      get().notify(
        `${r.plan.id} filed · ${r.notices_sent} consultation notice${r.notices_sent === 1 ? "" : "s"} created in the demo registry.`,
      );
      await get().refresh();
      return r.plan.id;
    } catch (e) {
      if (get().revision === revision) set({ error: String(e), busy: null });
      return null;
    }
  },
  notify: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 6500);
  },
}));

export function elevationAt(
  t: TerrainMesh | null,
  x: number,
  y: number,
): number {
  if (!t) return 0;
  const gx = Math.max(0, Math.min(t.n - 1.001, (x - t.x_min) / t.step_m));
  const gy = Math.max(0, Math.min(t.n - 1.001, (y - t.y_min) / t.step_m));
  const i = Math.floor(gx),
    j = Math.floor(gy),
    fx = gx - i,
    fy = gy - j;
  const a = t.elevations_m;
  return (
    (a[j * t.n + i] * (1 - fx) * (1 - fy) +
      a[j * t.n + i + 1] * fx * (1 - fy) +
      a[(j + 1) * t.n + i] * (1 - fx) * fy +
      a[(j + 1) * t.n + i + 1] * fx * fy) /
    1000
  );
}

session.onUnauthorized(() => {
  const s = useMission.getState();
  if (s.user) {
    useMission.setState({ user: null, organization: null, notices: [], plans: [] });
    s.notify("Your session has expired. Please sign in again.");
    s.setMode("login");
  }
});
