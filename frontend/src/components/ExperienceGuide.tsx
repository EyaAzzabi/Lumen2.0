import { fmtPct, fmtMeur } from "../api";
import { useEffect, useState } from "react";
import { useMission, type Mode } from "../mission";

const chapters = [
  {
    title: "Arrival",
    headline: "Welcome to the Moon. You’re not alone.",
    text: "Other missions are already here. What happens nearby matters. This fictional shared registry uses synthetic terrain.",
    mode: "experience",
  },
  {
    title: "Your landing",
    headline: "Now it’s your turn to land.",
    text: "Name your mission, choose a spacecraft preset and pick your landing spot. Sign in to work with your organization’s mission. Presets change only when you select them.",
    mode: "setup",
  },
  {
    title: "The consequence",
    headline: "Your landing doesn’t end where you touch down.",
    text: "Run the assessment, then inspect the equipment, its owner and mean modeled damage. How did PLUME calculate this? Open the method from the model limits badge.",
    mode: "operations",
  },
  {
    title: "A better way",
    headline: "What if you landed somewhere else?",
    text: "Run the optimizer and compare evaluated alternatives. Previewing keeps your draft intact. Choose a landing site explicitly, then review its new assessment.",
    mode: "optimizer",
  },
  {
    title: "The shared Moon",
    headline: "The Moon is shared. So is the responsibility.",
    text: "File a proposal, invite review through the real consultation, resolve objections and submit a revision. A neighbor must explicitly acknowledge it in a separate authenticated session.",
    mode: "notices",
  },
] as const;
const director = [
  [
    "Open a mission",
    "setup",
    "Open an organization draft from the mission library, or prepare a clearly fictional scenario.",
  ],
  [
    "Calculate exposure",
    "setup",
    "For the documented fictional example: Super-heavy preset, E 1500 / N -1500 m. Select Analyze this mission.",
  ],
  [
    "Inspect neighboring equipment",
    "operations",
    "Select equipment in the assessment. Read its owner and mean modeled damage.",
  ],
  [
    "File the proposal",
    "notices",
    "Submit your proposal explicitly. Consultations are created only after a successful filing.",
  ],
  [
    "Open the other organization",
    "notices",
    "Use another browser profile or private window. Log in as the consultation recipient; keep the original session open.",
  ],
  [
    "Submit a structured objection",
    "notices",
    "In the recipient session, select its equipment and provide a reason and optional limits. Submit Raise a concern yourself.",
  ],
  [
    "Return to the proposing operator",
    "notices",
    "In the original session, select the same proposal and Compare a revision.",
  ],
  [
    "Calculate a constrained alternative",
    "optimizer",
    "Select Find alternative sites. Active requirements come from the server.",
  ],
  [
    "Examine before and after",
    "optimizer",
    "Preview both footprints, inspect equipment differences and constraints. Adopt only a feasible evaluated candidate.",
  ],
  [
    "File the revision",
    "notices",
    "Review the reassessment, then submit the revision explicitly. This does not grant agreement.",
  ],
  [
    "Acknowledge the revision",
    "notices",
    "In the recipient session, review the current revision and select Acknowledge yourself.",
  ],
  [
    "Show history",
    "notices",
    "Open Activity & revision history. Earlier objections and responses remain recorded.",
  ],
  [
    "Download the dossier",
    "notices",
    "Expand the chosen persisted revision and download PDF or structured data.",
  ],
] as const;

function savedGuide(): {
  chapter: number | null;
  step: number | null;
  collapsed: boolean;
} {
  try {
    const value = JSON.parse(
      sessionStorage.getItem("plume.navigation-guide") ?? "null",
    );
    if (
      value &&
      (value.chapter === null ||
        (Number.isInteger(value.chapter) &&
          value.chapter >= 0 &&
          value.chapter < 5)) &&
      (value.step === null ||
        (Number.isInteger(value.step) && value.step >= 0 && value.step < 13))
    )
      return value;
  } catch {
    /* Navigation progress is optional. */
  }
  return { chapter: null, step: null, collapsed: false };
}
export default function ExperienceGuide() {
  const [chapter, setChapter] = useState<number | null>(
    () => savedGuide().chapter,
  );
  const [step, setStep] = useState<number | null>(() => savedGuide().step);
  const [collapsed, setCollapsed] = useState(() => savedGuide().collapsed);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "plume.navigation-guide",
        JSON.stringify({ chapter, step, collapsed }),
      );
    } catch {
      /* Optional navigation state only, no mission or identity. */
    }
  }, [chapter, step, collapsed]);
  const mode = useMission((s) => s.mode),
    user = useMission((s) => s.user);
  const assessment = useMission((s) => s.assessment),
    plan = useMission((s) => s.plans.find((p) => p.id === s.editingPlanId));
  useEffect(() => {
    const start = () => {
      setChapter(0);
      setStep(null);
      setCollapsed(false);
    };
    window.addEventListener("plume:experience", start);
    return () => window.removeEventListener("plume:experience", start);
  }, []);
  useEffect(() => {
    if (mode === "experience" && chapter === null) setChapter(0);
  }, [mode, chapter]);
  const registry = useMission((s) => s.assets),
    operators = useMission((s) => s.operators),
    optimization = useMission((s) => s.optimization);
  const affected = [...(assessment?.assets ?? [])].sort(
    (a, b) => b.expected_loss_meur - a.expected_loss_meur,
  )[0];
  const equipment = registry.find((a) => a.id === affected?.asset_id);
  const navigate = (target: Mode) => {
    const state = useMission.getState();
    state.setMode(target);
    if (target === "operations" && affected)
      state.selectAsset(affected.asset_id);
    else
      state.focus(
        target === "setup"
          ? "lander"
          : target === "optimizer"
            ? "comparison"
            : "overview",
      );
  };
  if (["gateway", "pricing", "login"].includes(mode)) return null;
  if (chapter === null && step === null)
    return (
      <button
        className="guide-toggle"
        onClick={() => {
          setStep(0);
          setCollapsed(false);
        }}
      >
        Five-minute demo guide
      </button>
    );
  const active = step !== null ? director[step] : null;
  const c = chapter !== null ? chapters[chapter] : null;
  return (
    <aside
      className={`experience-guide ${collapsed ? "collapsed" : ""}`}
      aria-label="Optional mission guide"
    >
      <div className="response-actions">
        <span>
          {active
            ? `DEMO DIRECTOR ${step! + 1} / 13`
            : `CHAPTER ${chapter! + 1} / 5 · ${c?.title}`}
        </span>
        <button
          className="action-text"
          aria-label={collapsed ? "Expand guide" : "Minimize guide"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "+" : "−"}
        </button>
        <button
          className="action-text"
          aria-label="Close guide"
          onClick={() => {
            setChapter(null);
            setStep(null);
            if (mode === "experience") navigate("gateway");
          }}
        >
          ×
        </button>
      </div>
      {!collapsed && (
        <>
          <h2>{active?.[0] ?? c?.headline}</h2>
          <p>{active?.[2] ?? c?.text}</p>
          {!active && chapter === 0 && (
            <ul>
              {registry.slice(0, 3).map((a) => (
                <li key={a.id}>
                  {a.name} ·{" "}
                  {operators.find((o) => o.id === a.operator_id)?.name ??
                    a.operator_id}
                </li>
              ))}
            </ul>
          )}
          {!active && chapter === 2 && affected && (
            <p role="status">
              {assessment!.summary.assets_at_risk
                ? "This landing could damage nearby equipment."
                : "The model shows little damage to nearby equipment."}{" "}
              {equipment?.name ?? affected.asset_id} ·{" "}
              {operators.find((o) => o.id === equipment?.operator_id)?.name ??
                equipment?.operator_id}
              : {fmtPct(affected.damage_fraction)} mean modeled damage,{" "}
              {fmtMeur(affected.expected_loss_meur)} modeled loss. Damage is not
              a failure probability.
            </p>
          )}
          {!active && chapter === 3 && optimization && (
            <p role="status">
              {optimization.best
                ? `Feasible evaluated alternative: ${fmtMeur(optimization.best.summary.expected_loss_meur)} modeled loss. Compare the move and remaining tradeoffs before adopting.`
                : "No feasible site found in the evaluated search. No global impossibility is established."}
            </p>
          )}
          {!active && chapter === 4 && (
            <p role="status">
              {plan
                ? `Persisted proposal r${plan.revision}: ${plan.status.split("_").join(" ")}`
                : assessment
                  ? "Scenario evaluated. No coordinated proposal selected."
                  : "Scenario not evaluated yet."}
            </p>
          )}
          <p className="panel-note">
            {user
              ? `Signed in: ${user.email}. Actions use this session’s permissions.`
              : "Public arrival view. Sign in to start a mission; no organization mission is created here."}
          </p>
          <div className="response-actions">
            <button
              className="outline-button"
              onClick={() =>
                navigate(
                  (active?.[1] ?? (chapter === 0 ? "setup" : c?.mode)) as Mode,
                )
              }
            >
              {active
                ? "Open this workspace"
                : chapter === 0
                  ? "Start your landing"
                  : "Open chapter workspace"}
            </button>
            <button
              className="action-text"
              disabled={(step ?? chapter ?? 0) === 0}
              onClick={() =>
                active
                  ? setStep(Math.max(0, step! - 1))
                  : setChapter(Math.max(0, chapter! - 1))
              }
            >
              Back
            </button>
            <button
              className="action-text"
              onClick={() => {
                if (active) setStep(step! === 12 ? null : step! + 1);
                else {
                  const next = Math.min(4, chapter! + 1);
                  setChapter(next);
                  if (chapter! < 4) navigate(chapters[next].mode);
                  else {
                    setChapter(null);
                    navigate("setup");
                  }
                }
              }}
            >
              {active
                ? step === 12
                  ? "Finish guide"
                  : "Skip / next"
                : chapter === 4
                  ? "Open your mission in Mission Control"
                  : "Next chapter"}
            </button>
          </div>
          {!active && (
            <button
              className="action-text"
              onClick={() => {
                setStep(0);
                setChapter(null);
              }}
            >
              Open five-minute demo director
            </button>
          )}
          <small>
            Navigation only. Calculations, filing, objections and
            acknowledgements require your explicit actions.
          </small>
        </>
      )}
    </aside>
  );
}
