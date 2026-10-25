import { useEffect, useMemo, useRef, useState } from "react";
import { useMission, type Mode } from "../mission";
import { Icon, type IconName } from "./Icon";
import { api, RISK_COLOR, type Member } from "../api";

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
        return `${a.name} ${a.type} ${op?.name ?? ""}`
          .toLowerCase()
          .includes(t);
      })
      .slice(0, 6);
  }, [q, assets, operators]);
  function pick(id: string) {
    const s = useMission.getState();
    if (!["operations", "registry", "simulation", "optimizer"].includes(s.mode))
      s.setMode("operations");
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

function timeAgo(seconds: number) {
  const d = Math.max(0, Date.now() / 1000 - seconds);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

/** Bell with a dropdown of the latest notices and responses. */
export function NotificationBell() {
  const notices = useMission((s) => s.notices),
    plans = useMission((s) => s.plans),
    acting = useMission((s) => s.actingId),
    operators = useMission((s) => s.operators);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const name = (id: string) => operators.find((o) => o.id === id)?.name ?? id;
  const unread = notices.filter(
    (n) => n.to_operator_id === acting && n.status === "unread" && !n.read_at,
  ).length;
  // Incoming notices, plus responses to notices this organization sent.
  const items = notices
    .map((n) => {
      const incoming = n.to_operator_id === acting;
      const when = incoming ? n.created_at : (n.responded_at ?? n.created_at);
      const text = incoming
        ? `${name(n.from_operator_id)} filed a landing that affects your assets`
        : n.status === "unread"
          ? `Consultation sent to ${name(n.to_operator_id)}`
          : `${name(n.to_operator_id)} ${n.status === "objection" ? "raised a concern" : "acknowledged"}`;
      return { n, incoming, when, text };
    })
    .sort((a, b) => b.when - a.when)
    .slice(0, 8);
  function openPlan(planId: string) {
    useMission.setState({ focusPlanId: planId });
    useMission.getState().setMode("notices");
    setOpen(false);
  }
  return (
    <div className="bell-wrap" ref={ref}>
      <button
        className="bell-button"
        aria-label={`Coordination notices${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="Bell" size={18} />
        {unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>
      {open && (
        <div className="bell-menu" role="menu">
          <div className="bell-menu-head">
            <b>Notifications</b>
            <small>{unread ? `${unread} unread` : "All caught up"}</small>
          </div>
          {items.length ? (
            items.map(({ n, incoming, when, text }) => (
              <button key={n.id + (incoming ? "-in" : "-out")} role="menuitem" className={`bell-item ${incoming && !n.read_at && n.status === "unread" ? "unread" : ""}`} onClick={() => openPlan(n.plan_id)}>
                <span className="bell-risk" style={{ background: RISK_COLOR[n.max_risk] }} />
                <span>
                  {text}
                  <small>
                    {plans.find((p) => p.id === n.plan_id)?.name ?? n.subject.split(" — ")[1] ?? "Proposal"} · {n.max_risk} · {timeAgo(when)}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="bell-empty">
              No activity yet. You are notified here when another operator's
              landing puts your assets at risk, and when neighbours respond to
              your proposals.
            </p>
          )}
          <button className="bell-all" onClick={() => { useMission.getState().setMode("notices"); setOpen(false); }}>
            Open coordination <Icon name="ArrowRight" size={13} />
          </button>
        </div>
      )}
    </div>
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
  const [members, setMembers] = useState<Member[] | null>(null);
  useEffect(() => {
    if (open && user)
      api.members().then(setMembers).catch(() => setMembers([]));
  }, [open, user]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!user || !org)
    return (
      <button
        className="signin-button"
        onClick={() => useMission.getState().setMode("login")}
      >
        Sign in <Icon name="ArrowRight" size={14} />
      </button>
    );
  return (
    <div className="account" ref={ref}>
      <button
        className="account-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="account-org">
          {org.name}
          <small>{user.role === "admin" ? "Administrator" : "Member"}</small>
        </span>
        <span
          className="avatar"
          style={{ boxShadow: `0 0 0 2px ${org.color}` }}
        >
          {initials(user.name) || "?"}
        </span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <span
              className="avatar large"
              style={{ boxShadow: `0 0 0 2px ${org.color}` }}
            >
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
              <span className="dot" style={{ background: org.color }} />{" "}
              {org.name}
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
          <div className="account-section">
            <span>Team · {members?.length ?? "…"}</span>
            {members?.map((m) => (
              <div key={m.id} className="member-row">
                <span className="avatar small">{initials(m.name) || "?"}</span>
                <span>
                  {m.name}
                  <small>{m.email}</small>
                </span>
                <em>{m.role === "admin" ? "Admin" : "Member"}</em>
              </div>
            ))}
            {org.invite_code && (
              <p className="account-note">
                Share the invite code above to add teammates to {org.name}.
              </p>
            )}
          </div>
          <div className="account-links">
            <button onClick={() => { useMission.getState().setMode("method"); setOpen(false); }}>
              <Icon name="CircleHelp" size={14} /> Model & assumptions
            </button>
            <button onClick={() => { useMission.getState().setMode("pricing"); setOpen(false); }}>
              <Icon name="Flag" size={14} /> Plans & pricing
            </button>
          </div>
          {user.demo && (
            <p className="account-note">
              Demo account of a fictional organization.
            </p>
          )}
          <button
            className="account-signout"
            onClick={() => void useMission.getState().signOut()}
          >
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

function missionStatus(
  mode: Mode,
  busy: string | null,
  hasAssessment: boolean,
) {
  if (busy === "optimizer" || mode === "optimizer")
    return ["Optimizing", "ice"];
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
      (s) =>
        s.notices.filter(
          (n) =>
            n.to_operator_id === s.actingId &&
            n.status === "unread" &&
            !n.read_at,
        ).length,
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
      {id === "notices" && unread > 0 && (
        <em className="side-badge">{unread}</em>
      )}
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
    [
      place ? "Click terrain…" : "Move landing site",
      "Crosshair",
      () => {
        useMission.setState({ placeMode: !place });
        if (!place) s().focus("top");
      },
    ],
    ["Simulate plume", "Zap", () => void s().simulate()],
    [
      "Run optimizer",
      "Sparkles",
      () => {
        s().setMode("optimizer");
        void s().optimize();
      },
    ],
    ["Generate report", "FileText", () => s().setMode("report")],
  ];
  return (
    <div className="quick-actions">
      <div>
        <span className="quick-actions-title">QUICK ACTIONS</span>
        {actions.map(([label, icon, run]) => (
          <button
            key={label}
            onClick={run}
            disabled={!!busy && label !== actions[0][0]}
          >
            <Icon name={icon} size={22} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
