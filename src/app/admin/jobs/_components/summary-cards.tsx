interface SummaryCardsProps {
  total: number;
  pending: number;
  active: number;
  revenue: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function fmtUsd(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function SummaryCards({ total, pending, active, revenue }: SummaryCardsProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">TOTAL LISTINGS</p>
        <p className="mt-1 text-3xl text-cream">{fmt(total)}</p>
      </div>
      <div className={`border p-4 ${pending > 0 ? "border-yellow-600/50 bg-yellow-900/10" : "border-border bg-bg-raised"}`}>
        <p className="text-xs text-muted">PENDING REVIEW</p>
        <p className={`mt-1 text-3xl ${pending > 0 ? "text-yellow-400" : "text-cream"}`}>
          {fmt(pending)}
        </p>
        {pending > 0 && (
          <p className="mt-0.5 text-[11px] text-yellow-400/70">needs attention</p>
        )}
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">ACTIVE</p>
        <p className="mt-1 text-3xl text-lime">{fmt(active)}</p>
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">REVENUE</p>
        <p className="mt-1 text-3xl text-cream">
          {revenue > 0 ? fmtUsd(revenue) : "$0"}
        </p>
      </div>
    </div>
  );
}
