"use client";

const ACCENT = "#c8e64a";

const PERIODS = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "ALL" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];

interface Props {
  value: Period;
  onChange: (period: Period) => void;
}

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex border-[2px] border-border text-xs">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className="px-3 py-1.5 transition-colors"
          style={{
            backgroundColor: value === p.value ? ACCENT : "transparent",
            color: value === p.value ? "#1a1018" : "var(--color-muted)",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
