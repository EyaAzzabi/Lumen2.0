import { lazy, Suspense, useEffect, useState } from "react";
import {
  useMission,
  DEFAULT_SITE,
  REPLAY_DURATION,
  type Mode,
} from "./mission";
import Gateway from "./components/Gateway";
import Configuration from "./components/Configuration";
import {
  OperationsPanel,
  ExposurePanel,
  OptimizerPanel,
  SceneControls,
} from "./components/MissionPanels";
import Timeline from "./components/Timeline";
import Report from "./components/Report";
import { Icon } from "./components/Icon";
import { Pricing, SubscriptionInfo } from "./components/Commercial";
import Auth from "./components/Auth";
import { AccountMenu, AssetSearch, NotificationBell, QuickActions, Sidebar } from "./components/Chrome";
import { RegistryPanel, RegistryDetail } from "./components/SharedRegistry";
import Coordination, { CommandOverview } from "./components/Coordination";
import { api } from "./api";
const LunarScene = lazy(() => import("./scene/LunarScene"));
const Method = lazy(() => import("./Method"));

function Header() {
  const mode = useMission((s) => s.mode),
    connected = useMission((s) => s.connected),
    acting = useMission((s) => s.actingId),
    user = useMission((s) => s.user),
    demo = useMission((s) => s.demo);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const publicMode = ["gateway", "pricing", "login"].includes(mode);
  const startDemo = async () => {
    // The walkthrough starts as the fictional Kestrel organisation (real demo sign-in).
    if (!(await useMission.getState().switchOperator("kestrel"))) return;
    const s = useMission.getState(),
      p = s.meta?.landers.find((p) => p.id === "superheavy");
    if (p)
      s.updateLander(
        {
          label: p.label,
          thrust_kn: p.thrust_kn,
          hover_s: p.hover_s,
          dispersion_m: p.dispersion_m,
        },
        p.id,
      );
    s.moveSite(DEFAULT_SITE);
    useMission.setState({
      missionName: "KLL Cargo-7",
      demo: true,
      demoStep: 0,
      demoPlanId: null,
      demoRecipient: null,
    });
    s.setMode("operations");
    s.focus("overview");
  };
  return (
    <header className="flight-header">
      <button
        className="flight-brand"
        onClick={() => useMission.getState().setMode("gateway")}
        aria-label="PLUME mission gateway"
      >
        <img src="/plume-mark.png" alt="PLUME official mark" />
        <span>
          PLUME<small>LUNAR LANDING COORDINATION</small>
        </span>
      </button>
      <span className="header-divider" />
      <div className="environment-label tpl-tagline">LUNAR LANDING COORDINATION</div>
      {publicMode ? (
        <nav className="public-nav" aria-label="Platform navigation">
          <button onClick={() => useMission.getState().setMode("gateway")}>Platform</button>
          <button
            className={mode === "pricing" ? "active" : ""}
            onClick={() => useMission.getState().setMode("pricing")}
          >
            Pricing
          </button>
          <button
            className={mode === "method" ? "active" : ""}
            onClick={() => useMission.getState().setMode("method")}
          >
            Method
          </button>
        </nav>
      ) : (
        <div className="header-spacer" />
      )}
      <div className="header-right">
        {!publicMode && <AssetSearch />}
        {!publicMode && <NotificationBell />}
        {user && !publicMode && (
          <button className="subscription-badge" onClick={() => setSubscriptionOpen(true)}>
            {acting === "kestrel" ? "OPERATOR" : "REGISTRY"}
            <small>PLAN</small>
          </button>
        )}
        {user && (
          <button
            className={`demo-button ${demo ? "active" : ""}`}
            disabled={!connected}
            onClick={() => (demo ? useMission.setState({ demo: false }) : startDemo())}
          >
            <Icon name="Play" size={13} />
            {demo ? "EXIT DEMO" : "DEMO"}
          </button>
        )}
        <AccountMenu />
      </div>
      {subscriptionOpen && (
        <SubscriptionInfo onClose={() => setSubscriptionOpen(false)} />
      )}
    </header>
  );
}

function GuidedDemo() {
  const step = useMission((s) => s.demoStep),
    busy = useMission((s) => s.busy),
    opt = useMission((s) => s.optimization),
    assessment = useMission((s) => s.assessment);
  const recipientReady = useMission((s) =>
    s.notices.some(
      (n) => n.plan_id === s.demoPlanId && n.to_operator_id === s.actingId,
    ),
  );
  const steps = [
    "Kestrel: inspect shared infrastructure.",
    "Inspect modeled exposure, then prepare consultation.",
    "File the original proposal and create actual notices.",
    "Switch to the affected operator.",
    "Record an objection as the recipient.",
    "Return to Kestrel to prepare mitigation.",
    "Search actual lower-cost landing candidates.",
    "Adopt the best feasible candidate.",
    "File the revised draft as a new proposal.",
    "Review responses. Original objections remain open.",
  ];
  const labels = [
    "SIMULATE",
    "PREPARE REPORT",
    "FILE ORIGINAL",
    "SWITCH OPERATOR",
    "RECORD OBJECTION",
    "RETURN TO KESTREL",
    "RUN OPTIMIZER",
    "ADOPT BEST",
    "FILE REVISED",
    "FINISH",
  ];
  async function next() {
    const s = useMission.getState();
    if (step === 0) {
      await s.simulate();
      if (!useMission.getState().assessment) return;
      useMission.setState({ demoStep: 1 });
    } else if (step === 1) {
      useMission.setState({
        playing: false,
        replay: REPLAY_DURATION,
        demoStep: 2,
      });
      s.setMode("report");
    } else if (step === 2) {
      const planId = await s.filePlan();
      if (!planId) return;
      const state = useMission.getState(),
        notice = state.notices
          .filter((n) => n.plan_id === planId)
          .sort((a, b) => b.expected_loss_meur - a.expected_loss_meur)[0];
      if (!notice) {
        s.notify(
          "No affected recipient was returned. Inspect the original scenario before continuing.",
        );
        return;
      }
      useMission.setState({
        demoStep: 3,
        demoPlanId: planId,
        demoRecipient: notice.to_operator_id,
      });
      s.setMode("notices");
    } else if (step === 3) {
      if (!s.demoRecipient) return;
      if (!(await s.switchOperator(s.demoRecipient))) return;
      s.setMode("notices");
      useMission.setState({ demoStep: 4 });
    } else if (step === 4) {
      const n = s.notices.find(
        (n) => n.plan_id === s.demoPlanId && n.to_operator_id === s.actingId,
      );
      if (!n) return;
      try {
        await api.updateNotice(
          n.id,
          "objection",
          "Please evaluate a lower-exposure landing site before proceeding.",
        );
        await s.refresh();
        useMission.setState({ demoStep: 5 });
      } catch (e) {
        useMission.setState({ error: String(e) });
      }
    } else if (step === 5) {
      if (!(await s.switchOperator("kestrel"))) return;
      s.setMode("optimizer");
      useMission.setState({ demoStep: 6 });
    } else if (step === 6) {
      await s.optimize();
      if (useMission.getState().optimization?.best)
        useMission.setState({ demoStep: 7 });
    } else if (step === 7) {
      if (!opt?.best) return;
      s.moveSite({ x: opt.best.site.x, y: opt.best.site.y }, true);
      s.focus("site");
      s.setMode("report");
      useMission.setState({ demoStep: 8 });
    } else if (step === 8) {
      useMission.setState({
        missionName: `${s.missionName.replace(/ · revised$/, "")} · revised`,
      });
      const planId = await useMission.getState().filePlan();
      if (planId) {
        s.setMode("notices");
        useMission.setState({ demoStep: 9 });
      }
    } else useMission.setState({ demo: false });
  }
  return (
    <div className="guided-demo">
      <span className="demo-step">
        DEMO / {String(step + 1).padStart(2, "0")}
      </span>
      <p>{steps[step]}</p>
      <button
        disabled={
          !!busy ||
          !assessment ||
          (step === 7 && !opt?.best) ||
          (step === 4 && !recipientReady)
        }
        onClick={() => void next()}
      >
        {labels[step]}
        <Icon name="ArrowRight" size={15} />
      </button>
      <button
        className="icon-button"
        aria-label="Close guided demo"
        onClick={() => useMission.setState({ demo: false })}
      >
        <Icon name="X" size={15} />
      </button>
    </div>
  );
}

export default function App() {
  const mode = useMission((s) => s.mode),
    meta = useMission((s) => s.meta),
    connected = useMission((s) => s.connected),
    revision = useMission((s) => s.revision),
    demo = useMission((s) => s.demo),
    error = useMission((s) => s.error),
    loadError = useMission((s) => s.loadError),
    toast = useMission((s) => s.toast),
    terrainError = useMission((s) => s.terrainError);
  useEffect(() => {
    void useMission.getState().load();
    const initial = location.hash.slice(1);
    const modes = [
      "gateway",
      "login",
      "pricing",
      "setup",
      "operations",
      "simulation",
      "replay",
      "optimizer",
      "report",
      "notices",
      "registry",
      "method",
    ];
    if (modes.includes(initial)) useMission.setState({ mode: initial as Mode });
  }, []);
  // Live coordination: poll notices while signed in and announce new ones.
  const userId = useMission((s) => s.user?.id);
  useEffect(() => {
    if (!userId) return;
    let known: Map<string, string> | null = null;
    const tick = async () => {
      if (document.hidden) return;
      await useMission.getState().refresh();
      const s = useMission.getState();
      const name = (id: string) => s.operators.find((o) => o.id === id)?.name ?? id;
      if (known) {
        for (const n of s.notices) {
          const before = known.get(n.id);
          if (!before && n.to_operator_id === s.actingId)
            s.notify(`New consultation notice from ${name(n.from_operator_id)} · ${n.max_risk.toUpperCase()} risk`);
          else if (before === "unread" && n.status !== "unread" && n.from_operator_id === s.actingId)
            s.notify(`${name(n.to_operator_id)} ${n.status === "objection" ? "raised an objection to" : "acknowledged"} ${n.plan_id}`);
        }
      }
      known = new Map(s.notices.map((n) => [n.id, n.status]));
    };
    void tick();
    const timer = setInterval(() => void tick(), 10_000);
    return () => clearInterval(timer);
  }, [userId]);
  useEffect(() => {
    if (!connected) return;
    const timer = setTimeout(() => void useMission.getState().analyze(), 300);
    return () => clearTimeout(timer);
  }, [connected, revision]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.activeElement instanceof HTMLInputElement) return;
        useMission.setState({ placeMode: false });
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("keydown", escape);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () =>
      useMission.setState({ reducedMotion: media.matches, playing: false });
    media.addEventListener("change", change);
    return () => {
      window.removeEventListener("keydown", escape);
      media.removeEventListener("change", change);
    };
  }, []);
  const legacy = mode === "method";
  const spatial =
    !legacy && !["report", "gateway", "login", "pricing"].includes(mode);
  return (
    <div className={`mission-app mode-${mode}`}>
      <Header />
      <main className="mission-stage">
        <div
          className="persistent-scene"
          aria-label="Interactive lunar environment"
        >
          <Suspense
            fallback={
              <div className="scene-loading">Loading lunar renderer…</div>
            }
          >
            <LunarScene />
          </Suspense>
        </div>
        {mode === "gateway" ? (
          <Gateway />
        ) : mode === "login" ? (
          <Auth />
        ) : mode === "pricing" ? (
          <Pricing />
        ) : (
          <>
            <Sidebar />
            {spatial && (
              <>
                <SceneControls />
                {mode === "registry" ? (
                  <>
                    <RegistryPanel />
                    <RegistryDetail />
                  </>
                ) : mode === "notices" ? (
                  <Coordination />
                ) : (
                  <>
                    {mode === "setup" ? <Configuration /> : <OperationsPanel />}
                    {mode === "optimizer" ? (
                      <OptimizerPanel />
                    ) : (
                      mode !== "setup" && <ExposurePanel />
                    )}
                  </>
                )}
                {mode === "operations" && <CommandOverview />}
                {mode === "operations" && <QuickActions />}
                {(mode === "simulation" || mode === "replay") && <Timeline />}
              </>
            )}
            {mode === "report" && <Report />}
            {legacy && (
              <div className="legacy-view">
                <Suspense
                  fallback={
                    <div className="scene-loading">Loading mission module…</div>
                  }
                >
                  {meta && <Method meta={meta} />}
                </Suspense>
              </div>
            )}
          </>
        )}
        {(error || (loadError && mode !== "gateway")) && (
          <div className="mission-error" role="alert">
            <Icon name="TriangleAlert" size={18} />
            <span>{error ?? loadError}</span>
            <button
              onClick={() =>
                void (loadError
                  ? useMission.getState().load()
                  : useMission.getState().analyze())
              }
            >
              RETRY
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() =>
                useMission.setState({ error: null, loadError: null })
              }
            >
              <Icon name="X" size={15} />
            </button>
          </div>
        )}
        {terrainError && mode !== "gateway" && (
          <div className="terrain-error" role="status">
            {terrainError}
          </div>
        )}
        {demo && mode !== "gateway" && <GuidedDemo />}
      </main>
      <footer className="flight-footer">
        <span>
          <span className="status-dot" />
          PLUME / OPERATIONAL PROTOTYPE
        </span>
        <span>
          {mode === "gateway"
            ? "ONE LANDING. EVERYONE’S SAFETY."
            : "SYNTHETIC TERRAIN · ASSET SYMBOLS ENLARGED · ILLUSTRATIVE REPLAY"}
        </span>
        <span>
          BEYOND 2030 <span className="footer-plus">+</span>
        </span>
      </footer>
      {toast && (
        <div className="mission-toast" role="status">
          <Icon name="Check" size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => useMission.setState({ toast: null })}
          >
            <Icon name="X" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
