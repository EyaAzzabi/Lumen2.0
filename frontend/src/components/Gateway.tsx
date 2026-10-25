import { useMission } from "../mission";
import { Icon, type IconName } from "./Icon";

export default function Gateway() {
  const connected = useMission((s) => s.connected),
    loadError = useMission((s) => s.loadError),
    assets = useMission((s) => s.assets),
    operators = useMission((s) => s.operators),
    reduced = useMission((s) => s.reducedMotion);
  const enter = () => useMission.getState().setMode("operations");
  const startDemo = () => {
    useMission.setState({ demo: true, demoStep: 0 });
    enter();
  };
  const features: [IconName, string, string, () => void][] = [
    [
      "Target",
      "Plan safely",
      "Compare before touchdown",
      () => useMission.getState().setMode("setup"),
    ],
    [
      "ShieldCheck",
      "Protect assets",
      "See the shared infrastructure",
      () => useMission.getState().setMode("registry"),
    ],
    [
      "Radio",
      "Coordinate",
      "Bring every operator into view",
      () => useMission.getState().setMode("notices"),
    ],
    [
      "Sparkles",
      "Find a better site",
      "Explore the real optimizer",
      () => useMission.getState().setMode("optimizer"),
    ],
  ];
  return (
    <div
      className="gateway cinematic-gateway"
      onPointerMove={(e) => {
        if (reduced) return;
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          "--look-x",
          `${(e.clientX / rect.width - 0.5) * -18}px`,
        );
        e.currentTarget.style.setProperty(
          "--look-y",
          `${((e.clientY - rect.top) / rect.height - 0.5) * -10}px`,
        );
      }}
    >
      <div className="hero-environment" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />
      <svg
        className="orbital-flow"
        viewBox="0 0 1920 1000"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="orbit-flow">
            <stop stopColor="#65d9ff" stopOpacity="0" />
            <stop offset=".6" stopColor="#65d9ff" />
            <stop offset="1" stopColor="#e9bd83" />
          </linearGradient>
        </defs>
        <path
          d="M720 720C1450 840 1530 550 1430 140"
          stroke="url(#orbit-flow)"
          strokeWidth="1"
        />
        <path
          className="orbit-moving"
          d="M720 720C1450 840 1530 550 1430 140"
          stroke="#c1f1ff"
          strokeWidth="2"
          strokeDasharray="5 800"
        />
        <circle cx="1430" cy="140" r="5" fill="#ffe7bf" />
      </svg>
      <section className="gateway-copy">
        <div className="eyeline">
          <span />
          LUNAR LANDING COORDINATION PLATFORM
        </div>
        <h1>
          One Landing.
          <br />
          <span>Everyone’s Safety.</span>
        </h1>
        <p>
          Protect what’s already on the Moon.
          <br />
          Plan your approach, understand your footprint,
          <br className="desktop-break" /> and coordinate the next shared
          frontier.
        </p>
        <div className="gateway-actions">
          <button
            className="action-primary"
            onClick={enter}
            disabled={!connected}
          >
            ENTER MISSION CONTROL <Icon name="ArrowRight" size={19} />
          </button>
          <button
            className="watch-demo"
            onClick={startDemo}
            disabled={!connected}
          >
            <span>
              <Icon name="Play" size={15} />
            </span>
            Watch the mission
          </button>
        </div>
        {loadError && (
          <div className="inline-error" role="alert">
            {loadError}
            <button onClick={() => void useMission.getState().load()}>
              Retry connection
            </button>
          </div>
        )}
        <div className="hero-proof">
          <div>
            <strong>
              {connected ? String(assets.length).padStart(2, "0") : "—"}
            </strong>
            <span>SHARED INSTALLATIONS</span>
          </div>
          <div>
            <strong>
              {connected ? String(operators.length).padStart(2, "0") : "—"}
            </strong>
            <span>DEMO ORGANIZATIONS</span>
          </div>
          <div>
            <strong>ONE</strong>
            <span>SHARED OPERATIONAL PICTURE</span>
          </div>
        </div>
      </section>
      <div className="frontier-timeline">
        <span>THE NEXT CHAPTER</span>
        <div>
          <i />
          <strong>Assess</strong>
          <small>Understand the exposure</small>
        </div>
        <div>
          <i />
          <strong>Optimize</strong>
          <small>Compare feasible sites</small>
        </div>
        <div>
          <i />
          <strong>Coordinate</strong>
          <small>Consult your neighbors</small>
        </div>
        <div className="future">
          <i />
          <strong>2040</strong>
          <small>Our exploration scenario</small>
        </div>
      </div>
      <div className="hero-bottom-deck">
        <button
          className="active-region-card"
          onClick={enter}
          disabled={!connected}
        >
          <img src="/moon.jpg" alt="Lunar orbital view" />
          <span>
            <small>EXPLORE THE MISSION</small>
            <strong>South Pole Region</strong>
            <em>Synthetic terrain · shared infrastructure</em>
          </span>
          <Icon name="Crosshair" size={27} />
        </button>
        <div className="frontier-features">
          {features.map(([icon, title, detail, action]) => (
            <button key={title} onClick={action} disabled={!connected}>
              <span>
                <Icon name={icon} size={25} />
              </span>
              <div>
                <strong>{title}</strong>
                <small>{detail}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="hero-art-caption">
        ILLUSTRATIVE VISION / 2040 <span />
        LIVE MISSION DATA IN WORKSPACE
      </div>
    </div>
  );
}
