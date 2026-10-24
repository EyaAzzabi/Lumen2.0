import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMission } from "../mission";
import { Icon } from "./Icon";

export const tiers = [
  {
    name: "Registry",
    eyebrow: "FOR INFRASTRUCTURE OWNERS",
    price: "Free",
    period: "Shared awareness starts here.",
    features: [
      "Register infrastructure",
      "Participate in the shared registry",
      "Receive landing notifications",
      "Acknowledge or object to plans",
    ],
    action: "REQUEST ACCESS",
    icon: "Layers" as const,
  },
  {
    name: "Mission",
    eyebrow: "FOR A SINGLE LUNAR LANDING",
    price: "€50,000",
    period: "Indicative / per landing",
    features: [
      "Mission planning",
      "Plume-risk simulation",
      "Landing-site optimization",
      "AI briefing and coordination reports",
    ],
    action: "CONTACT SALES",
    icon: "Target" as const,
  },
  {
    name: "Operator",
    eyebrow: "FOR MULTI-MISSION OPERATORS",
    price: "€500,000",
    period: "Indicative / per year",
    features: [
      "All Mission capabilities",
      "Proposed API access",
      "Multi-mission operations",
      "Proposed priority support",
    ],
    action: "CONTACT SALES",
    icon: "Orbit" as const,
  },
  {
    name: "Insurance / Agency",
    eyebrow: "FOR INSTITUTIONAL STAKEHOLDERS",
    price: "Custom",
    period: "Proposed annual license",
    features: [
      "Risk analysis access",
      "Proposed audit capabilities",
      "Institutional reporting",
      "Proposed institutional integrations",
    ],
    action: "DISCUSS A LICENSE",
    icon: "ShieldCheck" as const,
  },
];

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="platform-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="row between">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="X" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function SubscriptionInfo({ onClose }: { onClose: () => void }) {
  const operators = useMission((s) => s.operators),
    acting = useMission((s) => s.actingId),
    plans = useMission((s) => s.plans),
    assets = useMission((s) => s.assets);
  const tier = acting === "kestrel" ? "Operator" : "Registry",
    ownPlans = plans.filter((p) => p.operator_id === acting),
    now = new Date();
  const thisMonth = ownPlans.filter((p) => {
    const d = new Date(p.created_at * 1000);
    return (
      d.getUTCFullYear() === now.getUTCFullYear() &&
      d.getUTCMonth() === now.getUTCMonth()
    );
  }).length;
  return (
    <Modal title="Organization workspace" onClose={onClose}>
      <span className="demo-config-label">DEMO SUBSCRIPTION CONFIGURATION</span>
      <h3>{operators.find((o) => o.id === acting)?.name}</h3>
      <div className="subscription-tier">
        {tier}
        <span>
          {tier === "Operator"
            ? "Indicative €500,000 / year"
            : "Free registry participation"}
        </span>
      </div>
      <dl className="data-list">
        <dt>Owned infrastructure</dt>
        <dd>{assets.filter((a) => a.operator_id === acting).length}</dd>
        <dt>Filed plans, all time</dt>
        <dd>{ownPlans.length}</dd>
        <dt>Filed this month (UTC)</dt>
        <dd>{thisMonth}</dd>
      </dl>
      <p>
        Counts come from the live demo registry. Tier assignment is frontend
        demo configuration, not a purchased subscription. Every capability
        remains available.
      </p>
      <p className="panel-note">
        The organization selector is a demonstration context switch, not secure
        authentication. Production requires SSO, role-based access, tenant
        isolation and audit controls.
      </p>
      <button
        className="outline-button full"
        onClick={() => {
          onClose();
          useMission.getState().setMode("pricing");
        }}
      >
        VIEW INDICATIVE COMMERCIAL PLANS <Icon name="ArrowRight" size={15} />
      </button>
    </Modal>
  );
}

export function Pricing() {
  const [interest, setInterest] = useState<string | null>(null);
  return (
    <section className="pricing-workspace">
      <div className="pricing-heading">
        <div className="eyeline">THE SHARED LUNAR FRONTIER</div>
        <h1>
          Independent missions.
          <br />
          <span>Collective confidence.</span>
        </h1>
        <p>
          A shared infrastructure registry connects the people planning a
          landing
          <br className="desktop-break" /> with the people already on the
          surface.
        </p>
        <div className="indicative-banner">
          <Icon name="CircleHelp" size={14} />
          PROPOSED COMMERCIAL PRICING · INDICATIVE, NOT VERIFIED MARKET PRICES
        </div>
      </div>
      <div className="pricing-grid">
        {tiers.map((tier, i) => (
          <article
            className={`pricing-card ${i === 2 ? "featured" : ""}`}
            key={tier.name}
          >
            {i === 2 && (
              <div className="featured-label">MULTI-MISSION OPERATIONS</div>
            )}
            <div className="pricing-icon">
              <Icon name={tier.icon} size={24} />
            </div>
            <span className="pricing-eyebrow">{tier.eyebrow}</span>
            <h2>{tier.name}</h2>
            <div className="pricing-value">{tier.price}</div>
            <p className="pricing-period">{tier.period}</p>
            <div className="pricing-rule" />
            <ul>
              {tier.features.map((f) => (
                <li key={f}>
                  <Icon name="Check" size={14} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={
                i === 2 ? "action-primary full" : "outline-button full"
              }
              onClick={() => setInterest(tier.name)}
            >
              {tier.action}
              <Icon name="ArrowRight" size={14} />
            </button>
          </article>
        ))}
      </div>
      <div className="pricing-bottom">
        <div>
          <Icon name="Globe2" size={21} />
          <p>
            The registry gets more useful as more operators contribute accurate,
            current infrastructure data.
          </p>
        </div>
        <span>
          No active billing. No checkout. No artificial demo paywalls.
        </span>
      </div>
      {interest && (
        <Modal title={`${interest} access`} onClose={() => setInterest(null)}>
          <span className="demo-config-label">
            COMMERCIAL CONCEPT / NO REQUEST SENT
          </span>
          <p>
            This is an indicative commercial proposal. Sales intake, billing,
            service guarantees and enterprise integrations are not connected in
            this prototype.
          </p>
          <p>
            You can explore the working registry, assessments and coordination
            workflow through demo access. No payment or account is required.
          </p>
          <button
            className="action-primary full"
            onClick={() => {
              setInterest(null);
              useMission.getState().setMode("login");
            }}
          >
            EXPLORE DEMO ACCESS <Icon name="ArrowRight" size={15} />
          </button>
        </Modal>
      )}
    </section>
  );
}

export function Login() {
  const operators = useMission((s) => s.operators),
    connected = useMission((s) => s.connected),
    [selected, setSelected] = useState("kestrel"),
    [info, setInfo] = useState(false);
  return (
    <div className="login-workspace">
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
            <Icon name="Layers" size={16} /> Shared infrastructure
          </span>
          <span>
            <Icon name="ShieldCheck" size={16} /> Transparent exposure
          </span>
          <span>
            <Icon name="Radio" size={16} /> Cross-operator coordination
          </span>
        </div>
      </section>
      <section className="login-card">
        <img src="/plume-mark.png" alt="PLUME official logo" />
        <span className="eyeline compact">WELCOME TO MISSION CONTROL</span>
        <h2>A clearer path to touchdown.</h2>
        <p className="panel-intro">Enter the coordination workspace.</p>
        <div className="sso-concept">
          <div className="row between">
            <span>ENTERPRISE SIGN-IN</span>
            <span className="demo-config-label">ROADMAP</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setInfo(true);
            }}
          >
            <label className="form-label">
              WORK EMAIL
              <input
                type="email"
                placeholder="you@organization.com"
                autoComplete="email"
                aria-label="Work email for enterprise SSO concept"
              />
            </label>
            <button className="outline-button full" type="submit">
              <Icon name="ShieldCheck" size={16} />
              ABOUT ENTERPRISE SSO
            </button>
          </form>
          {info && (
            <p className="sso-info" role="status">
              No identity provider is configured. This form does not
              authenticate, send your email, or create an account. Production
              access requires organization SSO, roles, tenant isolation and
              audit controls.
            </p>
          )}
        </div>
        <div className="login-divider">
          <span />
          OR EXPLORE THE PROTOTYPE
          <span />
        </div>
        <label className="form-label">
          DEMO ORGANIZATION
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="action-primary full"
          disabled={!connected}
          onClick={() => {
            useMission.getState().switchOperator(selected);
            useMission.getState().setMode("operations");
          }}
        >
          ENTER DEMO WORKSPACE <Icon name="ArrowRight" size={16} />
        </button>
        <p className="login-disclosure">
          Demo context switching only. No password validation, authentication
          tokens or secure organization boundaries.
        </p>
      </section>
    </div>
  );
}
