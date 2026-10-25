import type { ReactNode } from "react";
import type { Risk } from "./api";
import { RISK_COLOR } from "./api";

export function RiskChip({ risk }: { risk: Risk }) {
  return <span className="chip" style={{ color: RISK_COLOR[risk] }}>{risk}</span>;
}

export function Spinner() {
  return <span className="spin" />;
}

function inline(text: string): ReactNode[] {
  // **bold** and *italic* only; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((s, i) => {
    if (s.startsWith("**") && s.endsWith("**")) return <strong key={i}>{s.slice(2, -2)}</strong>;
    if (s.startsWith("*") && s.endsWith("*") && s.length > 2) return <em key={i}>{s.slice(1, -1)}</em>;
    return s;
  });
}

export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`}>{list}</ul>);
    list = [];
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      flush();
      out.push(<h4 key={i}>{inline(line.replace(/^#+\s*/, ""))}</h4>);
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      list.push(<li key={i}>{inline(line.replace(/^\s*([-*]|\d+\.)\s/, ""))}</li>);
    } else if (line.trim()) {
      flush();
      out.push(<p key={i}>{inline(line)}</p>);
    } else {
      flush();
    }
  });
  flush();
  return <div className="brief">{out}</div>;
}

/** Plain-language meaning of the physics and planning terms shown in the UI. */
export const GLOSSARY: Record<string, string> = {
  "Engine thrust": "How hard the engine pushes. More thrust digs up more regolith and throws it faster.",
  "Low-altitude hover": "Seconds spent close to the ground before touchdown, when the exhaust erodes the surface.",
  "Landing dispersion": "How far off target the lander may touch down (1 standard deviation). Risk is averaged over 48 possible touchdown points.",
  "Energy exposure": "How hard the dust hits: kinetic energy of ejecta per square metre of the asset's exposed face.",
  "Fine dust": "Grams of fine dust and sand per square metre landing on the asset's exposed face. Coats solar cells and optics.",
  "Mean modeled damage": "Average fraction of the asset's value lost, over all possible touchdown points. Not a failure probability.",
  "Sample q95 / worst": "95th-percentile and worst damage among the touchdown samples. Not a confidence interval.",
  "Relocation": "Distance between your requested touchdown point and this alternative.",
  "Relocation cost": "Estimated extra cost of moving cargo over the surface from the alternative site.",
  "Total objective": "Modeled damage to everyone's assets plus relocation cost. The optimizer minimizes this.",
  "Terrain slope": "Ground slope at the site. Sites steeper than the maximum are excluded.",
  "Modeled infrastructure loss": "Expected damage to all registered assets of other operators, in euros, from the physics model.",
};

/** A term with a dotted underline that explains itself on hover or focus. */
export function Term({ children, tip }: { children: string; tip?: string }) {
  const text = tip ?? GLOSSARY[children];
  if (!text) return <>{children}</>;
  return (
    <span className="term" tabIndex={0} data-tip={text} aria-label={`${children}: ${text}`}>
      {children}
    </span>
  );
}
