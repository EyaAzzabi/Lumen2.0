import { useEffect, useMemo, useRef, useState } from "react";
import { useMission, type Mode } from "../mission";
import { Icon, type IconName } from "./Icon";

/* Template-style header widgets (asset search, notifications, account) and sidebar. */

export function AssetSearch() {
  const assets = useMission((s) => s.assets),
    operators = useMission((s) => s.operators);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return assets
      .filter((a) => {
        const op = operators.find((o) => o.id === a.operator_id);
        return `${a.name} ${a.type} ${op?.name ?? ""}`.toLowerCase().includes(t);
      })
      .slice(0, 6);
  }, [q, assets, operators]);
  function pick(id: string) {
    const s = useMission.getState();
    if (!["operations", "registry", "simulation", "optimizer"].includes(s.mode)) s.setMode("operations");
    s.selectAsset(id);
    setQ("");
    setOpen(false);
  }
  return (
    <div className="asset-search">
      <Icon name="Search" size={15} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) pick(results[0].id);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search asset, operator…"
        aria-label="Search registered assets"
      />
      {open && q && (
        <div className="search-results" role="listbox">
          {results.length ? (
            results.map((a) => {
              const op = operators.find((o) => o.id === a.operator_id);
              return (
                <button key={a.id} role="option" onMouseDown={() => pick(a.id)}>
                  <span className="dot" style={{ background: op?.color }} />
                  <span>
                    {a.name}
                    <small>
                      {op?.name} · {a.type.replace("_", " ")}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <p>No registered asset matches “{q}”.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  const unread = useMission(
    (s) => s.notices.filter((n) => n.to_operator_id === s.actingId && n.status === "unread").length,
  );
  return (
    <button
      className="bell-button"
      aria-label={`Coordination notices${unread ? `, ${unread} unread` : ""}`}
      onClick={() => useMission.getState().setMode("notices")}
    >
      <Icon name="Bell" size={18} />
      {unread > 0 && <span className="bell-badge">{unread}</span>}
    </button>
  );
}

function initials(name: string) {
  return name
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function AccountMenu() {
  const user = useMission((s) => s.user),
    org = useMission((s) => s.organization);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!user || !org)
    return (
      <button className="signin-button" onClick={() => useMission.getState().setMode("login")}>
        Sign in <Icon name="ArrowRight" size={14} />
      </button>
    );
  return (
    <div className="account" ref={ref}>
      <button className="account-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu">
        <span className="account-org">
          {org.name}
          <small>{user.role === "admin" ? "Administrator" : "Member"}</small>
        </span>
        <span className="avatar" style={{ boxShadow: `0 0 0 2px ${org.color}` }}>
          {initials(user.name) || "?"}
        </span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <span className="avatar large" style={{ boxShadow: `0 0 0 2px ${org.color}` }}>
              {initials(user.name)}
            </span>
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </div>
          </div>
          <dl>
            <dt>Organization</dt>
            <dd>
              <span className="dot" style={{ background: org.color }} /> {org.name}
            </dd>
            <dt>Role</dt>
            <dd>{user.role === "admin" ? "Administrator" : "Member"}</dd>
            {org.invite_code && (
              <>
                <dt>Invite code</dt>
                <dd>
                  <code>{org.invite_code}</code>
                  <button
                    className="icon-button"
                    aria-label="Copy invite code"
                    onClick={() => {
                      void navigator.clipboard?.writeText(org.invite_code!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <Icon name={copied ? "Check" : "Copy"} size={13} />
                  </button>
                </dd>
              </>
            )}
          </dl>
          {user.demo && <p className="account-note">Demo account of a fictional organization.</p>}
          <button className="account-signout" onClick={() => void useMission.getState().signOut()}>
            <Icon name="LogOut" size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const SIDEBAR: [Mode, string, IconName][] = [
  ["setup", "Mission Setup", "Box"],
  ["operations", "Overview", "Globe2"],
  ["registry", "Lunar Map", "Map"],
  ["simulation", "Simulation", "Zap"],
  ["replay", "4D Replay", "Play"],
  ["optimizer", "Optimizer", "Sparkles"],
  ["report", "Reports", "FileText"],
];
const SIDEBAR_SECONDARY: [Mode, string, IconName][] = [
  ["notices", "Coordination", "Radio"],
  ["pricing", "Plans", "Flag"],
  ["method", "Method", "CircleHelp"],
];

function missionStatus(mode: Mode, busy: string | null, hasAssessment: boolean) {
  if (busy === "optimizer" || mode === "optimizer") return ["Optimizing", "ice"];
  if (mode === "simulation" || mode === "replay") return ["Simulation", "gold"];
  if (hasAssessment) return ["Assessed", "ok"];
  return ["Planning", "muted"];
}

export function Sidebar() {
  const mode = useMission((s) => s.mode),
    lander = useMission((s) => s.lander),
    name = useMission((s) => s.missionName),
    window = useMission((s) => s.window),
    org = useMission((s) => s.organization),
    busy = useMission((s) => s.busy),
    assessment = useMission((s) => s.assessment),
    unread = useMission(
      (s) => s.notices.filter((n) => n.to_operator_id === s.actingId && n.status === "unread").length,
    );
  const [status, tone] = missionStatus(mode, busy, !!assessment);
  const item = ([id, label, icon]: [Mode, string, IconName]) => (
    <button
      key={id}
      className={mode === id ? "active" : ""}
      aria-current={mode === id ? "page" : undefined}
      onClick={() => useMission.getState().setMode(id)}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
      {id === "notices" && unread > 0 && <em className="side-badge">{unread}</em>}
    </button>
  );
  return (
    <nav className="mission-rail tpl-sidebar" aria-label="Mission control">
      <div className="sidebar-title">
        <Icon name="Rocket" size={15} /> MISSION CONTROL
      </div>
      <div className="sidebar-nav">{SIDEBAR.map(item)}</div>
      <div className="sidebar-nav secondary">{SIDEBAR_SECONDARY.map(item)}</div>
      <div className="region-card">
        <img src="/moon.jpg" alt="" />
        <div>
          <b>South Pole Region</b>
          <small>High activity zone · 30 × 30 km</small>
        </div>
      </div>
      <div className="mission-card">
        <div className="mission-card-title">Current Mission</div>
        <div className="mission-card-head">
          <span className="mission-card-icon">
            <Icon name="Rocket" size={20} />
          </span>
          <div>
            <b>{name || "Untitled mission"}</b>
            <small>{org?.name ?? "Not signed in"}</small>
            <span className={`status-chip ${tone}`}>{status}</span>
          </div>
        </div>
        <dl>
          <dt>Lander</dt>
          <dd>{lander.label}</dd>
          <dt>Engine thrust</dt>
          <dd>{lander.thrust_kn.toLocaleString()} kN</dd>
          <dt>Low hover</dt>
          <dd>{lander.hover_s} s</dd>
          <dt>Dispersion</dt>
          <dd>± {lander.dispersion_m} m</dd>
          <dt>Window</dt>
          <dd>{window}</dd>
        </dl>
      </div>
      <div className="sidebar-foot">
        PLUME v1.0
        <small>Beyond 2030</small>
      </div>
    </nav>
  );
}

export function QuickActions() {
  const busy = useMission((s) => s.busy),
    place = useMission((s) => s.placeMode);
  const s = () => useMission.getState();
  const actions: [string, IconName, () => void][] = [
    [place ? "Click terrain…" : "Move landing site", "Crosshair", () => {
      useMission.setState({ placeMode: !place });
      if (!place) s().focus("top");
    }],
    ["Simulate plume", "Zap", () => void s().simulate()],
    ["Run optimizer", "Sparkles", () => {
      s().setMode("optimizer");
      void s().optimize();
    }],
    ["Generate report", "FileText", () => s().setMode("report")],
  ];
  return (
    <div className="quick-actions">
      <div>
        <span className="quick-actions-title">QUICK ACTIONS</span>
        {actions.map(([label, icon, run]) => (
          <button key={label} onClick={run} disabled={!!busy && label !== actions[0][0]}>
            <Icon name={icon} size={22} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
