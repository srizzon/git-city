const ACCENT = "#c8e64a";

interface Props {
  label: string;
  value: string | number;
  change?: number; // percentage change vs previous period
}

export function StatsCard({ label, value, change }: Props) {
  const displayValue = typeof value === "number" ? value.toLocaleString() : value;

  return (
    <div className="border-[3px] border-border p-4">
      <p className="text-xs text-muted normal-case">{label}</p>
      <p className="mt-1 text-2xl text-cream">{displayValue}</p>
      {change !== undefined && change !== 0 && (
        <p
          className="mt-1 text-xs normal-case"
          style={{ color: change > 0 ? ACCENT : "#ff6b6b" }}
        >
          {change > 0 ? "+" : ""}{change.toFixed(1)}% vs prev
        </p>
      )}
    </div>
  );
}
