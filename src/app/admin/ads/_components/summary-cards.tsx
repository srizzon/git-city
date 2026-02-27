interface SummaryCardsProps {
  totals: {
    impressions: number;
    clicks: number;
    cta_clicks: number;
    ctr: string;
  };
}

export function SummaryCards({ totals }: SummaryCardsProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-[11px] text-muted">IMPRESSIONS</p>
        <p className="mt-1 text-2xl text-cream">
          {totals.impressions.toLocaleString()}
        </p>
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-[11px] text-muted">3D CLICKS</p>
        <p className="mt-1 text-2xl text-cream">
          {totals.clicks.toLocaleString()}
        </p>
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-[11px] text-muted">CTA CLICKS</p>
        <p className="mt-1 text-2xl text-cream">
          {totals.cta_clicks.toLocaleString()}
        </p>
      </div>
      <div className="border border-border bg-bg-raised p-4">
        <p className="text-[11px] text-muted">CTR</p>
        <p className="mt-1 text-2xl text-lime">{totals.ctr}</p>
      </div>
    </div>
  );
}
