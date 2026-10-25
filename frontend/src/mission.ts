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
  type Session,
  type User,
  type Organization,
  type AuthSession,
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
export type CameraView = "overview" | "top" | "site" | "asset" | "lander";
export type Layers = Record<
  "terrain" | "infrastructure" | "zones" | "hazard" | "candidates",
  boolean
>;
export const DEFAULT_SITE = { x: 0, y: 0 };
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

export const PUBLIC_MODES: Mode[] = ["gateway", "login", "pricing", "method"];
interface Mission {
  user: User | null;
  organization: Organization | null;
  authChecked: boolean;
  afterLogin: Mode;
  applySession: (session: AuthSession) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: Parameters<typeof api.signup>[0]) => Promise<void>;
  signOut: () => Promise<void>;

  missionReady: boolean;
  preview: {
    site: Pt;
    assessment: Assessment;
    footprint: Footprint;
    label: string;
  } | null;
  mode: Mode;
  session: Session | null;
  editingPlanId: string | null;
  editingRevision: number | null;
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
  busy: "analysis" | "optimizer" | "brief" | "submit" | "session" | null;
  error: string | null;
  toast: string | null;
  refreshKey: number;
  selectedAsset: string | null;
  placeMode: boolean;
  cameraView: CameraView;
  cameraTick: number;
  viewpoint: string;
  tour: boolean;
  sceneStyle: "perspective" | "heatmap" | "wireframe" | "infrastructure";
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
  switchOperator: (id: string) => Promise<void>;
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
  /** Previous touchdown point, offered as "Undo" after adopting a site. */
  undoSite: { site: Pt; label: string } | null;
  adoptSite: (site: Pt, label: string) => void;
  undoAdopt: () => void;
  /** Plan to open when the user arrives from the notification list. */
  focusPlanId: string | null;
  /** Map picking for asset registration. */
  pickingAsset: boolean;
  assetPick: Pt | null;
}

let toastTimer: ReturnType<typeof setTimeout>;
export const useMission = create<Mission>((set, get) => ({
  user: null,
  organization: null,
  authChecked: false,
  afterLogin: "setup",
  applySession: (session) =>
    set({
      session,
      user: session.user,
      organization: session.organization,
      actingId: session.organization_id!,
      plans: [],
      notices: [],
      editingPlanId: null,
      editingRevision: null,
      missionReady: false,
      preview: null,
      coordinationError: null,
    }),
  signIn: async (email, password) => {
    get().applySession(await api.login(email, password));
    await get().refresh();
  },
  signUp: async (body) => {
    get().applySession(await api.signup(body));
    await get().refresh();
  },
  signOut: async () => {
    try {
      await api.logout();
    } finally {
      set({
        session: null,
        user: null,
        organization: null,
        plans: [],
        notices: [],
        editingPlanId: null,
        editingRevision: null,
        demo: false,
        playing: false,
        busy: null,
      });
      get().setMode("gateway");
    }
  },
  missionReady: false,
  preview: null,
  mode: "gateway",
  session: null,
  editingPlanId: null,
  editingRevision: null,
  meta: null,
  terrain: null,
  assets: [],
  operators: [],
  connected: false,
  loadError: null,
  terrainError: null,
  lander: {
    label: "Light robotic lander",
    thrust_kn: 4,
    hover_s: 25,
    dispersion_m: 150,
  },
  presetId: "clps",
  site: DEFAULT_SITE,
  revision: 0,
  missionName: "",
  window: `${new Date(Date.now() + 3600000).toISOString()} / ${new Date(Date.now() + 7200000).toISOString()}`,
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
  viewpoint: "colony",
  tour: false,
  sceneStyle: "perspective",
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
  setMode: (mode) => {
    if (get().authChecked && !get().user && !PUBLIC_MODES.includes(mode)) {
      set({ afterLogin: mode });
      mode = "login";
    }
    const previous = get().mode;
    if (
      !get().missionReady &&
      ["operations", "simulation", "replay", "optimizer"].includes(mode)
    )
      mode = "setup";
    set({ mode, placeMode: false, preview: null });
    history.replaceState(null, "", `#${mode}`);
    if (mode === "gateway") set({ playing: false });
    if (mode === "operations" && previous === "gateway")
      set({ tour: !get().reducedMotion, viewpoint: "colony" });
    if (!["operations", "registry", "optimizer"].includes(mode))
      set({ tour: false });
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
      const session = await api.session();
      set({
        session,
        user: session.user ?? null,
        organization: session.organization ?? null,
        actingId: session.organization_id ?? "kestrel",
        authChecked: true,
      });
      if (session.user) void get().refresh();
      else if (!PUBLIC_MODES.includes(get().mode)) get().setMode(get().mode);
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
    if (!get().session?.authenticated) return;
    try {
      const [assets, plans, notices, operators] = await Promise.all([
        api.assets(),
        api.plans(),
        api.notices(actingId),
        api.operators(),
      ]);
      if (get().actingId !== actingId) return;
      const changed = JSON.stringify(assets) !== JSON.stringify(get().assets);
      set((s) => ({
        assets,
        plans,
        notices,
        operators,
        coordinationError: null,
        refreshKey: s.refreshKey + 1,
        ...(changed
          ? {
              revision: s.revision + 1,
              preview: null,
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
    set({ busy: "session", coordinationError: null });
    try {
      const session = await api.demoSession(actingId);
      set((s) => ({
        session,
        user: session.user ?? null,
        organization: session.organization ?? null,
        actingId: session.organization_id!,
        notices: [],
        plans: [],
        selectedAsset: null,
        editingPlanId: null,
        editingRevision: null,
        busy: null,
        registryFilter: {
          ...s.registryFilter,
          operator:
            s.registryFilter.operator === s.actingId
              ? actingId
              : s.registryFilter.operator,
        },
      }));
      await get().refresh();
    } catch (e) {
      set({
        busy: null,
        coordinationError: `Session switch failed: ${String(e)}`,
      });
    }
  },
  updateLander: (patch, presetId = "custom") =>
    set((s) => ({
      lander: { ...s.lander, ...patch },
      presetId,
      revision: s.revision + 1,
      preview: null,
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
      preview: null,
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
    if (get().mode === "setup") get().focus("lander");
  },
  focus: (cameraView) =>
    set((s) => ({ cameraView, cameraTick: s.cameraTick + 1 })),
  selectAsset: (selectedAsset) => {
    set({ selectedAsset });
    if (selectedAsset) get().focus("asset");
  },
  analyze: async () => {
    const { lander, site, revision, connected } = get();
    if (!connected || !get().missionReady) return false;
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
    if (
      !get().assessment ||
      !missionName.trim() ||
      !window.trim() ||
      !get().session?.permissions.includes("plans:write")
    )
      return null;
    set({ busy: "submit", error: null });
    try {
      const payload = {
        lander,
        site,
        operator_id: actingId,
        name: missionName,
        window,
      };
      const editing = get().editingPlanId;
      const r = editing
        ? await api.revisePlan(editing, {
            ...payload,
            expected_revision: get().editingRevision ?? 1,
          })
        : await api.submitPlan(payload);
      set({ editingPlanId: r.plan.id, editingRevision: r.plan.revision ?? 1 });
      if (get().revision === revision) set({ busy: null });
      get().notify(
        `Proposal filed · ${r.notices_sent} consultation${r.notices_sent === 1 ? "" : "s"} created.`,
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
    set({ toast, undoSite: null });
    toastTimer = setTimeout(() => set({ toast: null }), 6500);
  },
  undoSite: null,
  adoptSite: (site, label) => {
    const previous = get().site;
    get().moveSite(site, true);
    get().focus("site");
    clearTimeout(toastTimer);
    set({
      toast: `${label} adopted · reassessing exposure at the new touchdown point.`,
      undoSite: { site: previous, label },
    });
    toastTimer = setTimeout(() => set({ toast: null, undoSite: null }), 9000);
  },
  undoAdopt: () => {
    const u = get().undoSite;
    if (!u) return;
    clearTimeout(toastTimer);
    set({ toast: null, undoSite: null });
    get().moveSite(u.site, true);
    get().focus("site");
    get().notify("Previous touchdown point restored.");
  },
  focusPlanId: null,
  pickingAsset: false,
  assetPick: null,
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

api.onUnauthorized(() => {
  useMission.setState({
    session: null,
    user: null,
    organization: null,
    plans: [],
    notices: [],
    editingPlanId: null,
    editingRevision: null,
    busy: null,
    demo: false,
  });
  useMission.getState().setMode("login");
});
