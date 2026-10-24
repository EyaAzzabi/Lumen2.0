import { useCallback, useEffect, useMemo, useState } from "react";
import Method from "./Method";
import Notices from "./Notices";
import Planner from "./Planner";
import Registry from "./Registry";
import type { Asset, Meta, Notice, Operator } from "./api";
import { api } from "./api";

type Tab = "home" | "planner" | "notices" | "registry" | "method";

function Stars() {
  const shadow = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 160 }, () =>
      `${(rnd() * 100).toFixed(2)}vw ${(rnd() * 100).toFixed(2)}vh 0 ${rnd() < 0.1 ? 1 : 0}px rgba(220,230,255,${(0.25 + rnd() * 0.6).toFixed(2)})`,
    ).join(",");
  }, []);
  return <div className="stars" style={{ boxShadow: shadow }} />;
}

function Home({ go }: { go: (t: Tab) => void }) {
  return (
    <div className="page home">
      <Stars />
      <div className="home-inner">
        <div className="home-hero">
          <div>
            <div className="eyebrow">Lunar landing coordination platform</div>
            <h2 className="headline">One landing.<br /><span>Everyone's safety.</span></h2>
            <p className="home-lede">
              Every landing on the Moon blasts regolith outward at up to 1.7 km/s, and with no air to stop it, the
              debris flies for kilometres. As agencies and companies crowd the lunar south pole, one operator's
              touchdown can sandblast another's solar farm, telescope or habitat. PLUME predicts each plume, finds a
              safer site and coordinates every operator before the engines fire.
            </p>
            <div className="row" style={{ gap: 12, marginTop: 26 }}>
              <button className="btn ice" style={{ padding: "13px 22px" }} onClick={() => go("planner")}>Enter Mission Control →</button>
              <button className="btn ghost" style={{ padding: "13px 22px" }} onClick={() => go("method")}>How it works</button>
            </div>
            <div className="facts">
              <div><b>160 m</b><span>Apollo 12 sandblasted Surveyor 3 from this distance (1969)</span></div>
              <div><b>~2 t</b><span>of regolith moved by Chandrayaan-3's touchdown (2023)</span></div>
              <div><b>§ 11</b><span>Artemis Accords: avoid harmful interference, consult first</span></div>
            </div>
          </div>
          <div className="hero-art">
            <img src="/plume-logo.jpg" alt="PLUME" />
          </div>
          <ol className="timeline">
            <li><b>1969</b>Apollo 12 plume damages Surveyor 3</li>
            <li><b>2020</b>Artemis Accords signed</li>
            <li><b>2023</b>Chandrayaan-3 lands near the south pole</li>
            <li><b>2030s</b>Several operators share the same sunlit ridges</li>
            <li><b>2040</b>Routine cargo traffic, permanent bases <em>(our scenario)</em></li>
          </ol>
        </div>
        <div className="features">
          {[
            ["Predict", "Physics model of every plume: four grain sizes, ballistic arcs, terrain shielding."],
            ["Protect", "Shared registry of everyone's assets, priced damage per asset."],
            ["Optimise", "Searches ~1,800 nearby sites for the lowest total risk to everyone."],
            ["Coordinate", "Automatic consultation notices; neighbours acknowledge or object."],
          ].map(([t, d]) => (
            <div key={t} className="feature"><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const initial = (location.hash.slice(1) || "home") as Tab;
  const [tab, setTabState] = useState<Tab>(["home", "planner", "notices", "registry", "method"].includes(initial) ? initial : "home");
  const setTab = useCallback((t: Tab) => { setTabState(t); history.replaceState(null, "", `#${t}`); }, []);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [actingId, setActingId] = useState("kestrel");
  const [refreshKey, setRefreshKey] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.meta(), api.operators()])
      .then(([m, o]) => { setMeta(m); setOperators(o); })
      .catch((e) => setLoadError(String(e)));
  }, []);
  useEffect(() => { api.assets().then(setAssets).catch(() => {}); }, [refreshKey]);
  useEffect(() => { api.notices(actingId).then(setNotices).catch(() => {}); }, [actingId, refreshKey, tab]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    refresh();
    setTimeout(() => setToast(null), 4200);
  }, [refresh]);

  const unread = notices.filter((n) => n.to_operator_id === actingId && n.status === "unread").length;
  const acting = operators.find((o) => o.id === actingId);

  if (loadError) {
    return <div className="empty" style={{ margin: 40 }}>Cannot reach the PLUME API ({loadError}). Start the backend on port 8000.</div>;
  }
  if (!meta) return <div className="empty" style={{ margin: 40, border: 0 }}>Loading PLUME…</div>;

  const tabs: [Tab, string][] = [
    ["planner", "Mission Planner"], ["notices", "Notices"], ["registry", "Registry"], ["method", "Method"],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("home")} style={{ background: "none", border: 0, cursor: "pointer" }}>
          <img src="/plume-mark.png" alt="" />
          <div style={{ textAlign: "left" }}>
            <div className="brand-name">PLUME</div>
            <div className="brand-tag">Lunar landing coordination</div>
          </div>
        </button>
        <nav className="tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              {label}{id === "notices" && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="acting">
          <span className="dot" style={{ background: acting?.color }} />
          Acting as
          <select value={actingId} onChange={(e) => setActingId(e.target.value)}>
            {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </header>
      <main style={{ minHeight: 0, position: "relative" }}>
        {tab === "home" && <Home go={setTab} />}
        {tab === "planner" && <Planner meta={meta} assets={assets} operators={operators} actingId={actingId} onSubmitted={showToast} />}
        {tab === "notices" && <Notices operators={operators} actingId={actingId} refreshKey={refreshKey} onChanged={refresh} />}
        {tab === "registry" && <Registry meta={meta} assets={assets} operators={operators} actingId={actingId} refreshKey={refreshKey} onChanged={refresh} />}
        {tab === "method" && <Method meta={meta} />}
      </main>
      {toast && <div className="toast"><span className="dot" style={{ background: "var(--ok)" }} />{toast}</div>}
    </div>
  );
}
