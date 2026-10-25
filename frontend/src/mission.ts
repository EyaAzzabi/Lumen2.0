import { create } from "zustand";
import {
  api,
  type Assessment,
  type DraftData,
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
  | "experience"
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
export type CameraView =
  | "overview"
  | "top"
  | "site"
  | "asset"
  | "lander"
  | "original"
  | "candidate"
  | "comparison";
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

export const PUBLIC_MODES: Mode[] = [
  "gateway",
  "experience",
  "login",
  "pricing",
  "method",
];
interface Mission {
  user: User | null;
  organization: Organization | null;
  authChecked: boolean;
  afterLogin: Mode;
  applySession: (session: AuthSession) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: Parameters<typeof api.signup>[0]) => Promise<void>;
  signOut: () => Promise<void>;

  optimizationRunId: string | null;
  draftId: string | null;
  draftVersion: number;
  draftFingerprint: string;
  draftStatus: "local" | "saving" | "saved" | "filed" | "error";
  draftError: string | null;
  saveDraft: () => Promise<string | null>;
  openDraft: (id: string) => Promise<void>;
  newDraft: () => Promise<void>;
  sessionEpoch: number;
  clearPrivate: () => void;
  missionReady: boolean;
  comparisonSite: Pt | null;
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
  loadTerrain: () => Promise<void>;
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

function privateDefaults() {
  return {
    comparisonSite: null,
    optimizationRunId: null,
    draftId: null,
    draftVersion: 0,
    draftFingerprint: "",
    draftStatus: "local" as const,
    draftError: null,
    missionReady: false,
    missionName: "",
    site: { ...DEFAULT_SITE },
    lander: {
      label: "Light robotic lander",
      thrust_kn: 4,
      hover_s: 25,
      dispersion_m: 150,
    },
    presetId: "clps",
    window: `${new Date(Date.now() + 3600000).toISOString()} / ${new Date(Date.now() + 7200000).toISOString()}`,
    plans: [],
    notices: [],
    assessment: null,
    footprint: null,
    optimization: null,
    brief: null,
    assessedAt: null,
    editingPlanId: null,
    editingRevision: null,
    selectedAsset: null,
    preview: null,
    busy: null,
    error: null,
    toast: null,
    coordinationError: null,
    focusPlanId: null,
    undoSite: null,
    pickingAsset: false,
    assetPick: null,
    placeMode: false,
    playing: false,
    replay: 0,
    tour: false,
    demo: false,
    demoStep: 0,
    demoPlanId: null,
    demoRecipient: null,
    searchRadius: 4000,
    traverseCost: 2,
    maxSlope: 8,
    clearance: 300,
    registryFilter: { operator: "all", type: "all", region: "all" },
  };
}
export const draftSignature = (v: DraftData) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
export function draftData(s: Mission): DraftData {
  return {
    name: s.missionName,
    window: s.window,
    mission_ready: s.missionReady,
    lander: s.lander,
    site: s.site,
    editing_plan_id: s.editingPlanId,
    editing_revision: s.editingRevision,
    search_radius_m: s.searchRadius,
    traverse_meur_per_km: s.traverseCost,
    max_slope_deg: s.maxSlope,
    clearance_m: s.clearance,
    optimization_run_id: s.optimizationRunId,
  };
}
let pendingDraft: Promise<string | null> | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
export const useMission = create<Mission>((set, get) => ({
  optimizationRunId: null,
  draftId: null,
  draftVersion: 0,
  draftFingerprint: "",
  draftStatus: "local",
  draftError: null,
  newDraft: async () => {
    const s = get();
    if (s.draftId && s.draftStatus !== "filed") {
      const saved = await s.saveDraft();
      if (!saved) return;
    }
    const fresh = privateDefaults();
    set({
      optimizationRunId: null,
      missionName: "",
      missionReady: false,
      lander: fresh.lander,
      site: fresh.site,
      window: fresh.window,
      assessment: null,
      footprint: null,
      optimization: null,
      brief: null,
      preview: null,
      selectedAsset: null,
      draftId: null,
      draftVersion: 0,
      draftFingerprint: "",
      draftStatus: "local",
      draftError: null,
      editingPlanId: null,
      editingRevision: null,
      revision: get().revision + 1,
    });
    get().setMode("setup");
    await get().saveDraft();
  },
  openDraft: async (id) => {
    const epoch = get().sessionEpoch;
    try {
      const d = await api.getDraft(id);
      if (get().sessionEpoch !== epoch) return;
      if (d.status !== "draft")
        throw new Error(
          "Restore this archived draft or open its filed proposal.",
        );
      const v = d.data;
      set({
        optimizationRunId: v.optimization_run_id ?? null,
        missionName: v.name,
        window: v.window,
        missionReady: v.mission_ready,
        lander: v.lander,
        site: v.site,
        presetId: "custom",
        editingPlanId: v.editing_plan_id,
        editingRevision: v.editing_revision,
        searchRadius: v.search_radius_m,
        traverseCost: v.traverse_meur_per_km,
        maxSlope: v.max_slope_deg,
        clearance: v.clearance_m,
        draftId: d.id,
        draftVersion: d.version,
        draftFingerprint: draftSignature(v),
        draftStatus: "saved",
        draftError: null,
        assessment: null,
        footprint: null,
        optimization: null,
        brief: null,
        preview: null,
        selectedAsset: null,
        revision: get().revision + 1,
      });
      get().setMode("setup");
    } catch (e) {
      if (epoch === get().sessionEpoch)
        set({ draftStatus: "error", draftError: String(e) });
    }
  },
  saveDraft: async () => {
    const requestEpoch = get().sessionEpoch;
    if (pendingDraft) {
      await pendingDraft;
      if (get().sessionEpoch !== requestEpoch) return null;
      if (get().user) return get().saveDraft();
      return null;
    }
    const s = get(),
      epoch = s.sessionEpoch;
    if (
      !s.user ||
      !s.session?.permissions.includes("plans:write") ||
      s.draftStatus === "filed"
    )
      return null;
    const data = draftData(s),
      fingerprint = draftSignature(data);
    if (s.draftId && fingerprint === s.draftFingerprint) return s.draftId;
    set({ draftStatus: "saving", draftError: null });
    pendingDraft = (async () => {
      try {
        const d = s.draftId
          ? await api.updateDraft(s.draftId, data, s.draftVersion)
          : await api.createDraft(data);
        if (get().sessionEpoch !== epoch) return null;
        set({
          draftId: d.id,
          draftVersion: d.version,
          draftFingerprint: draftSignature(data),
          draftStatus: "saved",
          draftError: null,
        });
        return d.id;
      } catch (e) {
        if (get().sessionEpoch === epoch)
          set({ draftStatus: "error", draftError: String(e) });
        return null;
      }
    })();
    const result = await pendingDraft;
    pendingDraft = null;
    return result;
  },
  sessionEpoch: 0,
  clearPrivate: () => {
    api.cancelRequests();
    clearTimeout(toastTimer);
    set({
      ...privateDefaults(),
      revision: get().revision + 1,
      sessionEpoch: get().sessionEpoch + 1,
    });
  },
  user: null,
  organization: null,
  authChecked: false,
  afterLogin: "setup",
  applySession: (session) => {
    get().clearPrivate();
    set({
      session,
      user: session.user,
      organization: session.organization,
      actingId: session.organization_id!,
      authChecked: true,
    });
    if (!get().terrain) void get().loadTerrain();
  },
  signIn: async (email, password) => {
    get().applySession(await api.login(email, password));
    await get().refresh();
  },
  signUp: async (body) => {
    get().applySession(await api.signup(body));
    await get().refresh();
  },
  signOut: async () => {
    if (get().draftId && get().draftStatus !== "filed") await get().saveDraft();
    get().clearPrivate();
    const epoch = get().sessionEpoch;
    try {
      await api.logout();
    } finally {
      if (get().sessionEpoch !== epoch) return;
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
  comparisonSite: null,
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
    const epoch = get().sessionEpoch;
    set({ loadError: null });
    try {
      const [meta, assets, operators] = await Promise.all([
        api.meta(),
        api.assets(),
        api.operators(),
      ]);
      if (get().sessionEpoch !== epoch) return;
      set({ meta, assets, operators, connected: true });
      const session = await api.session();
      if (get().sessionEpoch !== epoch) return;
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
      if (get().sessionEpoch !== epoch) return;
      set({
        connected: false,
        loadError: `Mission data unavailable. ${String(e)}`,
      });
    }
    try {
      const terrain = await api.terrainMesh();
      if (get().sessionEpoch !== epoch) return;
      set({ terrain, terrainError: null });
    } catch {
      if (get().sessionEpoch !== epoch) return;
      set({
        terrainError: "3D terrain unavailable. The 2D map remains operational.",
      });
    }
  },
  loadTerrain: async () => {
    const epoch = get().sessionEpoch;
    try {
      const terrain = await api.terrainMesh();
      if (epoch === get().sessionEpoch) set({ terrain, terrainError: null });
    } catch (e) {
      if (epoch === get().sessionEpoch)
        set({ terrainError: `Terrain unavailable. ${String(e)}` });
    }
  },
  refresh: async () => {
    const actingId = get().actingId,
      epoch = get().sessionEpoch;
    if (!get().session?.authenticated) return;
    try {
      const [assets, plans, notices, operators] = await Promise.all([
        api.assets(),
        api.plans(),
        api.notices(actingId),
        api.operators(),
      ]);
      if (get().actingId !== actingId || get().sessionEpoch !== epoch) return;
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
      if (get().actingId === actingId && get().sessionEpoch === epoch)
        set({
          coordinationError: `Coordination data unavailable: ${String(e)}`,
        });
    }
  },
  switchOperator: async (actingId) => {
    get().clearPrivate();
    const epoch = get().sessionEpoch;
    set({ busy: "session" });
    try {
      const session = await api.demoSession(actingId);
      if (get().sessionEpoch !== epoch) return;
      get().applySession(session);
      await get().refresh();
    } catch (e) {
      if (get().sessionEpoch === epoch)
        set({ busy: null, coordinationError: String(e) });
    }
  },
  updateLander: (patch, presetId = "custom") =>
    set((s) => ({
      lander: { ...s.lander, ...patch },
      presetId,
      optimizationRunId: null,
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
      optimizationRunId: null,
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
    const epoch = get().sessionEpoch;
    const { lander, site, revision, connected } = get();
    if (!connected || !get().missionReady) return false;
    set({ busy: "analysis", error: null, assessment: null, footprint: null });
    try {
      const [assessment, footprint] = await Promise.all([
        api.assess(lander, site),
        api.footprint(lander, site),
      ]);
      if (get().revision !== revision || get().sessionEpoch !== epoch)
        return false;
      set({
        assessment,
        footprint,
        assessedAt: new Date().toISOString(),
        busy: null,
      });
      return true;
    } catch (e) {
      if (get().revision === revision && get().sessionEpoch === epoch)
        set({ error: `Assessment failed: ${String(e)}`, busy: null });
      return false;
    }
  },
  optimize: async () => {
    const epoch = get().sessionEpoch;
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
        plan_id: get().editingPlanId,
      });
      if (get().revision === revision && get().sessionEpoch === epoch) {
        set({
          optimization,
          busy: null,
          layers: { ...get().layers, candidates: true },
        });
        get().focus("overview");
      }
    } catch (e) {
      if (get().revision === revision && get().sessionEpoch === epoch)
        set({ error: `Optimizer failed: ${String(e)}`, busy: null });
    }
  },
  generateBrief: async () => {
    const epoch = get().sessionEpoch;
    const { lander, site, optimization, revision, assessment } = get();
    if (
      !assessment ||
      assessment.site.x !== site.x ||
      assessment.site.y !== site.y
    ) {
      set({ error: "Assess the current site before generating a briefing." });
      return;
    }
    set({ busy: "brief", error: null });
    try {
      const brief = await api.brief(
        lander,
        site,
        optimization?.target.site.x === site.x &&
          optimization?.target.site.y === site.y
          ? (optimization.best?.site ?? null)
          : null,
      );
      if (get().revision === revision && get().sessionEpoch === epoch)
        set({ brief, busy: null });
    } catch (e) {
      if (get().revision === revision && get().sessionEpoch === epoch)
        set({ error: String(e), busy: null });
    }
  },
  simulate: async () => {
    const epoch = get().sessionEpoch;
    get().setMode("simulation");
    const revision = get().revision;
    const ok =
      get().assessment && get().footprint ? true : await get().analyze();
    if (ok && revision === get().revision && epoch === get().sessionEpoch) {
      set({
        replay: get().reducedMotion ? REPLAY_DURATION : 0,
        playing: !get().reducedMotion,
        layers: { ...get().layers, hazard: true },
      });
      get().focus("site");
    }
  },
  filePlan: async () => {
    const epoch = get().sessionEpoch;
    const { missionName, window, revision } = get();
    if (
      !get().assessment ||
      !missionName.trim() ||
      !window.trim() ||
      !get().session?.permissions.includes("plans:write")
    )
      return null;
    set({ busy: "submit", error: null });
    try {
      const draftId = await get().saveDraft();
      if (get().sessionEpoch !== epoch) return null;
      if (!draftId)
        throw new Error(get().draftError ?? "Save the draft before filing.");
      if (get().revision !== revision)
        throw new Error(
          "Mission changed while saving. Review its new assessment before filing.",
        );
      const r = await api.fileDraft(draftId, get().draftVersion);
      if (get().sessionEpoch !== epoch) return null;
      set({
        editingPlanId: r.plan.id,
        editingRevision: r.plan.revision ?? 1,
        draftStatus: "filed",
      });
      if (get().revision === revision && get().sessionEpoch === epoch)
        set({ busy: null });
      get().notify(
        `Proposal filed · ${r.notices_sent} consultation${r.notices_sent === 1 ? "" : "s"} created.`,
      );
      await get().refresh();
      return r.plan.id;
    } catch (e) {
      if (get().revision === revision && get().sessionEpoch === epoch)
        set({ error: String(e), busy: null });
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
      optimizationRunId: get().optimization?.run_id ?? null,
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
  useMission.getState().clearPrivate();
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
