interface SummaryCardsProps {
  totals: {
    impressions: number;
    clicks: number;
    cta_clicks: number;
    ctr: string;
  };
  periodDays: number | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export function SummaryCards({ totals, periodDays }: SummaryCardsProps) {
  const dailyAvg = periodDays && periodDays > 0
    ? Math.round(totals.impressions / periodDays)
    : null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">VIEWS</p>
        <p className="mt-1 text-3xl text-cream">
          {fmt(totals.impressions)}
        </p>
        {dailyAvg !== null && (
          <p className="mt-0.5 text-[11px] text-dim">
            ~{fmt(dailyAvg)}/day
          </p>
        )}
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">ENGAGEMENTS</p>
        <p className="mt-1 text-3xl text-cream">
          {fmt(totals.clicks)}
        </p>
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">LINK CLICKS</p>
        <p className="mt-1 text-3xl text-cream">
          {fmt(totals.cta_clicks)}
        </p>
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-xs text-muted">CLICK RATE</p>
        <p className="mt-1 text-3xl text-lime">{totals.ctr}</p>
      </div>
    </div>
  );
}
