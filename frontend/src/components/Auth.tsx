import { useEffect, useState, type FormEvent } from "react";
import { api, type DemoAccount } from "../api";
import { useMission } from "../mission";
import { Icon } from "./Icon";

type Tab = "signin" | "signup";

export default function Auth() {
  const connected = useMission((s) => s.connected),
    afterLogin = useMission((s) => s.afterLogin);
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [orgMode, setOrgMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [invite, setInvite] = useState("");
  const [demo, setDemo] = useState<DemoAccount[]>([]);

  useEffect(() => {
    api.demoAccounts().then(setDemo).catch(() => setDemo([]));
  }, []);
  useEffect(() => setError(null), [tab]);

  const enter = () => {
    const s = useMission.getState();
    s.setMode(afterLogin === "login" ? "operations" : afterLogin);
    s.notify(`Signed in as ${s.user?.name} · ${s.organization?.name}`);
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      enter();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function submitSignIn(e: FormEvent) {
    e.preventDefault();
    void run(() => useMission.getState().signIn(email, password));
  }

  function submitSignUp(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    void run(() =>
      useMission.getState().signUp({
        name,
        email,
        password,
        organization: orgMode,
        ...(orgMode === "create" ? { organization_name: orgName } : { invite_code: invite }),
      }),
    );
  }

  return (
    <div className="login-workspace auth-workspace">
      <section className="login-story">
        <div className="eyeline">A SHARED FRONTIER</div>
        <h1>
          Your mission.
          <br />
          Their infrastructure.
          <br />
          <span>One shared picture.</span>
        </h1>
        <p>
          Plan your landing with every registered
          <br />
          neighbor in view.
        </p>
        <div className="login-principles">
          <span>
            <Icon name="Layers" size={16} /> Shared infrastructure registry
          </span>
          <span>
            <Icon name="ShieldCheck" size={16} /> Organization-scoped access
          </span>
          <span>
            <Icon name="Radio" size={16} /> Cross-operator consultation
          </span>
        </div>
      </section>

      <section className="login-card auth-card">
        <img src="/plume-mark.png" alt="PLUME official logo" />
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "active" : ""} onClick={() => setTab("signin")}>
            Sign in
          </button>
          <button role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "active" : ""} onClick={() => setTab("signup")}>
            Create account
          </button>
        </div>

        {tab === "signin" ? (
          <form onSubmit={submitSignIn} className="auth-form">
            <h2>Welcome back to Mission Control.</h2>
            <label className="form-label">
              WORK EMAIL
              <span className="auth-input">
                <Icon name="Mail" size={15} />
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organization.com" />
              </span>
            </label>
            <label className="form-label">
              PASSWORD
              <span className="auth-input">
                <Icon name="Lock" size={15} />
                <input type={showPw ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="icon-button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw(!showPw)}>
                  <Icon name={showPw ? "EyeOff" : "Eye"} size={15} />
                </button>
              </span>
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="action-primary full" disabled={busy || !connected} type="submit">
              {busy ? "SIGNING IN…" : "SIGN IN"} <Icon name="ArrowRight" size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={submitSignUp} className="auth-form">
            <h2>Register your organization.</h2>
            <label className="form-label">
              FULL NAME
              <span className="auth-input">
                <Icon name="UserRound" size={15} />
                <input required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </span>
            </label>
            <label className="form-label">
              WORK EMAIL
              <span className="auth-input">
                <Icon name="Mail" size={15} />
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organization.com" />
              </span>
            </label>
            <div className="auth-pair">
              <label className="form-label">
                PASSWORD
                <span className="auth-input">
                  <Icon name="Lock" size={15} />
                  <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </span>
              </label>
              <label className="form-label">
                CONFIRM
                <span className="auth-input">
                  <Icon name="Lock" size={15} />
                  <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </span>
              </label>
            </div>
            <div className="auth-segment" role="radiogroup" aria-label="Organization">
              <button type="button" className={orgMode === "create" ? "active" : ""} onClick={() => setOrgMode("create")}>
                <Icon name="Building2" size={15} /> New organization
              </button>
              <button type="button" className={orgMode === "join" ? "active" : ""} onClick={() => setOrgMode("join")}>
                <Icon name="KeyRound" size={15} /> Join with invite
              </button>
            </div>
            {orgMode === "create" ? (
              <label className="form-label">
                ORGANIZATION NAME
                <span className="auth-input">
                  <Icon name="Building2" size={15} />
                  <input required minLength={2} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Carthage Lunar Systems" />
                </span>
              </label>
            ) : (
              <label className="form-label">
                INVITE CODE
                <span className="auth-input">
                  <Icon name="KeyRound" size={15} />
                  <input required value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
                </span>
                <small className="auth-hint">Ask an administrator of your organization. Admins find it in their account menu.</small>
              </label>
            )}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="action-primary full" disabled={busy || !connected} type="submit">
              {busy ? "CREATING ACCOUNT…" : "CREATE ACCOUNT"} <Icon name="ArrowRight" size={16} />
            </button>
          </form>
        )}

        {demo.length > 0 && (
          <details className="demo-accounts">
            <summary>Demo organizations (fictional) · one-click sign in</summary>
            <div>
              {demo.map((d) => (
                <button key={d.email} disabled={busy} onClick={() => void run(() => useMission.getState().signIn(d.email, d.password))}>
                  <span>{d.organization}</span>
                  <small>{d.email}</small>
                </button>
              ))}
            </div>
            <p>Password for all demo accounts: <code>{demo[0].password}</code></p>
          </details>
        )}
        <p className="login-disclosure">
          Passwords are salted and hashed (PBKDF2-SHA256). Sessions expire after 7 days. Each organization only
          sees its own notices and can only act for itself.
        </p>
      </section>
    </div>
  );
}
