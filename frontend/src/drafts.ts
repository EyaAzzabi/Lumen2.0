import { registerDraftFlush } from "./draftLifecycle";
import { useEffect } from "react";
import { api, type WorkspaceDraft } from "./api";
import { useMission } from "./mission";

function snapshot(): WorkspaceDraft {
  const s = useMission.getState();
  return {
    resolution_notice_id: s.resolutionNoticeId,
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
    asset_limits: s.assetLimits,
  };
}
export function useWorkspaceDraft() {
  const user = useMission((s) => s.user?.id),
    org = useMission((s) => s.organization?.id);
  useEffect(() => {
    if (!user || !org) return;
    let live = true,
      loaded = false,
      version = 0,
      saved = "",
      observed = "",
      timer: ReturnType<typeof setTimeout> | undefined;
    let active: Promise<void> | null = null,
      conflict = false;
    const owns = () =>
      live &&
      useMission.getState().user?.id === user &&
      useMission.getState().organization?.id === org;
    useMission.setState({ draftStatus: "loading", draftError: null });
    const save = async (): Promise<void> => {
      clearTimeout(timer);
      if (active) {
        await active;
        if (owns()) return save();
        return;
      }
      if (!owns() || !loaded || conflict) return;
      const draft = snapshot(),
        encoded = JSON.stringify(draft);
      if (encoded === saved) return;
      useMission.setState({ draftStatus: "saving", draftError: null });
      active = (async () => {
        try {
          const r = await api.saveDraft(draft, version);
          if (!owns()) return;
          version = r.version;
          saved = encoded;
          useMission.setState({
            draftStatus: "saved",
            draftSavedAt: r.updated_at,
            draftError: null,
          });
        } catch (e) {
          if (!owns()) return;
          conflict = String(e).includes("409");
          useMission.setState({ draftStatus: "error", draftError: String(e) });
        }
      })();
      await active;
      active = null;
      if (owns() && !conflict && JSON.stringify(snapshot()) !== encoded)
        timer = setTimeout(() => void save(), 600);
    };
    const unsubscribe = useMission.subscribe(() => {
      const next = JSON.stringify(snapshot());
      if (!owns() || !loaded || conflict || next === observed) return;
      observed = next;
      if (next === saved) return;
      useMission.setState({ draftStatus: "saving", draftError: null });
      clearTimeout(timer);
      timer = setTimeout(() => void save(), 600);
    });
    const releaseFlush = registerDraftFlush(save);
    void api
      .getDraft()
      .then((r) => {
        if (!owns()) return;
        version = r.version;
        if (r.draft) {
          const d = r.draft,
            s = useMission.getState();
          useMission.setState({
            resolutionNoticeId: d.resolution_notice_id,
            missionName: d.name,
            window: d.window,
            missionReady: d.mission_ready,
            lander: d.lander,
            presetId: "custom",
            site: d.site,
            editingPlanId: d.editing_plan_id,
            editingRevision: d.editing_revision,
            searchRadius: d.search_radius_m,
            traverseCost: d.traverse_meur_per_km,
            maxSlope: d.max_slope_deg,
            clearance: d.clearance_m,
            assetLimits: d.asset_limits,
            revision: s.revision + 1,
            assessment: null,
            footprint: null,
            optimization: null,
            brief: null,
            preview: null,
          });
        }
        saved = JSON.stringify(snapshot());
        observed = saved;
        loaded = true;
        useMission.setState({
          draftStatus: r.draft ? "saved" : "idle",
          draftSavedAt: r.updated_at,
          draftError: null,
        });
      })
      .catch((e) => {
        if (owns())
          useMission.setState({
            draftStatus: "error",
            draftError: `Cannot load your draft. ${String(e)}`,
          });
      });
    const retry = () => {
      if (owns()) {
        if (!loaded || conflict) window.location.reload();
        else void save();
      }
    };
    window.addEventListener("plume:save-draft", retry);
    return () => {
      live = false;
      unsubscribe();
      clearTimeout(timer);
      releaseFlush();
      window.removeEventListener("plume:save-draft", retry);
    };
  }, [user, org]);
}
