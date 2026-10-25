import ExperienceGuide from "./components/ExperienceGuide";
import { useDraftAutosave } from "./components/MissionLibrary";
import { lazy, Suspense, useEffect, useState } from "react";
import { useMission, type Mode } from "./mission";
import Auth from "./components/Auth";
import { AccountMenu, NotificationBell } from "./components/Chrome";
import Gateway from "./components/Gateway";
import Configuration from "./components/Configuration";
import Report from "./components/Report";
import { Icon } from "./components/Icon";
import { Pricing, SubscriptionInfo } from "./components/Commercial";
import { RegistryPanel, RegistryDetail } from "./components/SharedRegistry";
import {
  JourneyRail,
  JourneyCanvas,
  AnalysisWorkspace,
  CoordinationWorkspace,
} from "./components/JourneyWorkspace";
import { SceneControls } from "./components/MissionPanels";
const LunarScene = lazy(() => import("./scene/LunarScene"));
const Method = lazy(() => import("./Method"));

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="utc-clock">
      {now.toLocaleTimeString("en-GB", { timeZone: "UTC" })}
      <small>UTC</small>
    </span>
  );
}

function Header() {
  const mode = useMission((s) => s.mode),
    connected = useMission((s) => s.connected),
    operators = useMission((s) => s.operators),
    acting = useMission((s) => s.actingId),
    demo = useMission((s) => s.demo),
    user = useMission((s) => s.user),
    session = useMission((s) => s.session);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const publicMode = ["gateway", "pricing", "login"].includes(mode);
  const startDemo = () => useMission.getState().setMode("setup");
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
      <div className="environment-label">
        <span className="status-dot" />{" "}
        {publicMode ? "THE NEXT SHARED FRONTIER" : "MISSION CONTROL"}
        <small>EXPLORATION SYSTEM / 01</small>
      </div>
      {publicMode && (
        <nav className="public-nav" aria-label="Platform navigation">
          <button onClick={() => useMission.getState().setMode("gateway")}>
            Platform
          </button>
          <button
            className={mode === "pricing" ? "active" : ""}
            onClick={() => useMission.getState().setMode("pricing")}
          >
            Pricing
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => useMission.getState().setMode("login")}
          >
            Log in <Icon name="ArrowRight" size={13} />
          </button>
        </nav>
      )}
      <div className="header-right">
        <div className="connection-label">
          <span className={`status-dot ${connected ? "" : "offline"}`} />
          {connected ? "BACKEND CONNECTED" : "CONNECTING"}
        </div>
        <Clock />
        {!publicMode && (
          <>
            {user?.demo && session?.demo_enabled && (
              <label className="operator-switch">
                <span>DEMO ORGANIZATION</span>
                <select
                  aria-label="Acting as operator"
                  value={acting}
                  onChange={(e) =>
                    useMission.getState().switchOperator(e.target.value)
                  }
                >
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <NotificationBell />
            <AccountMenu />
            <button
              className="subscription-badge"
              onClick={() => setSubscriptionOpen(true)}
            >
              {acting === "kestrel" ? "OPERATOR" : "REGISTRY"}
              <small>DEMO PLAN</small>
            </button>
          </>
        )}
        <button
          className={`demo-button ${demo ? "active" : ""}`}
          disabled={!connected || !session?.demo_enabled}
          onClick={() =>
            demo ? useMission.setState({ demo: false }) : startDemo()
          }
        >
          <Icon name="Play" size={13} />
          {demo ? "EXIT DEMO" : "DEMO MODE"}
        </button>
      </div>
      {subscriptionOpen && (
        <SubscriptionInfo onClose={() => setSubscriptionOpen(false)} />
      )}
    </header>
  );
}

export default function App() {
  useDraftAutosave();
  const mode = useMission((s) => s.mode),
    meta = useMission((s) => s.meta),
    connected = useMission((s) => s.connected),
    revision = useMission((s) => s.revision),
    missionReady = useMission((s) => s.missionReady),
    error = useMission((s) => s.error),
    loadError = useMission((s) => s.loadError),
    toast = useMission((s) => s.toast),
    undoSite = useMission((s) => s.undoSite),
    pickingAsset = useMission((s) => s.pickingAsset),
    terrainError = useMission((s) => s.terrainError);
  useEffect(() => {
    void useMission.getState().load();
    const initial = location.hash.slice(1);
    const modes = [
      "gateway",
      "experience",
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
    if (modes.includes(initial)) useMission.getState().setMode(initial as Mode);
    const navigate = () => {
      const next = location.hash.slice(1);
      if (modes.includes(next) && useMission.getState().mode !== next)
        useMission.getState().setMode(next as Mode);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    if (!connected || !missionReady) return;
    const timer = setTimeout(() => void useMission.getState().analyze(), 300);
    return () => clearTimeout(timer);
  }, [connected, revision, missionReady]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const shortcuts = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (t &&
          (t.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))
      )
        return;
      const s = useMission.getState();
      if (!s.user || ["gateway", "login", "pricing"].includes(s.mode)) return;
      const key = e.key.toLowerCase();
      if (key === "?") setShortcutsOpen((v) => !v);
      else if (key === "1") s.setMode("setup");
      else if (key === "2" && s.missionReady) s.setMode("operations");
      else if (key === "3") s.setMode("notices");
      else if (key === "o" && s.assessment && !s.busy) {
        s.setMode("optimizer");
        void s.optimize();
      } else if (key === "r") s.setMode("report");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useMission.setState({ placeMode: false, pickingAsset: false });
        document.body.style.cursor = "";
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", escape);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () =>
      useMission.setState({
        reducedMotion: media.matches,
        playing: false,
        tour: false,
      });
    media.addEventListener("change", change);
    return () => {
      window.removeEventListener("keydown", escape);
      media.removeEventListener("change", change);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !useMission.getState().busy)
        void useMission.getState().refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  const legacy = mode === "method";
  const spatial =
    !legacy &&
    !["report", "gateway", "experience", "login", "pricing"].includes(mode);
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
            <JourneyRail />
            {spatial && (
              <>
                {mode === "registry" ? (
                  <>
                    <SceneControls />
                    <RegistryPanel />
                    <RegistryDetail />
                  </>
                ) : (
                  <>
                    <JourneyCanvas />
                    {mode === "setup" ? (
                      <Configuration />
                    ) : mode === "notices" ? (
                      <CoordinationWorkspace
                        key={useMission.getState().sessionEpoch}
                      />
                    ) : (
                      <AnalysisWorkspace
                        key={useMission.getState().sessionEpoch}
                      />
                    )}
                  </>
                )}
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
            <button
              className="action-text"
              onClick={() => void useMission.getState().load()}
            >
              Retry terrain
            </button>
          </div>
        )}
      </main>
      <ExperienceGuide />
      <footer className="flight-footer">
        <span>
          <span className="status-dot" />
          PLUME / OPERATIONAL PROTOTYPE
          <button
            className="footer-shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            ? SHORTCUTS
          </button>
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
      {pickingAsset && (
        <div className="pick-hint" role="status">
          <Icon name="Crosshair" size={16} />
          Click the terrain to place your new asset
          <button onClick={() => useMission.setState({ pickingAsset: false })}>
            Cancel
          </button>
        </div>
      )}
      {shortcutsOpen && (
        <div
          className="shortcuts"
          role="dialog"
          aria-label="Keyboard shortcuts"
          onClick={() => setShortcutsOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <b>Keyboard shortcuts</b>
            <dl>
              <dt>
                <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
              </dt>
              <dd>Prepare · Analyze · Coordinate</dd>
              <dt>
                <kbd>O</kbd>
              </dt>
              <dd>Find alternative landing sites</dd>
              <dt>
                <kbd>R</kbd>
              </dt>
              <dd>Open the full report</dd>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>Cancel map picking / close</dd>
              <dt>
                <kbd>?</kbd>
              </dt>
              <dd>Show or hide this help</dd>
            </dl>
          </div>
        </div>
      )}
      {toast && (
        <div className="mission-toast" role="status">
          <Icon name="Check" size={18} />
          {toast}
          {undoSite && (
            <button
              className="toast-undo"
              onClick={() => useMission.getState().undoAdopt()}
            >
              Undo
            </button>
          )}
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
