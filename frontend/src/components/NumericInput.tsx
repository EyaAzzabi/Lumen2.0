import { useEffect, useState } from "react";
import { useMission } from "../mission";

// Keep intermediate text local so operators can type a minus sign, clear a
// field, or replace a multi-digit number without committing partial values.
export default function NumericInput({
  value,
  min,
  max,
  step = 1,
  disabled,
  label,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid =
    draft.trim() !== "" &&
    Number.isFinite(Number(draft)) &&
    Number(draft) >= min &&
    Number(draft) <= max;
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      aria-invalid={!valid}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={() => {
        if (valid) {
          if (Number(draft) !== value) onCommit(Number(draft));
        } else {
          setDraft(String(value));
          useMission
            .getState()
            .notify(
              `${label}: enter a value from ${min.toLocaleString()} to ${max.toLocaleString()}. The previous valid value was restored.`,
            );
        }
      }}
    />
  );
}
