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
