import Link from "next/link";

const ACCENT = "#c8e64a";

const VEHICLE_ICONS: Record<string, string> = {
  plane: "\u2708",
  blimp: "\u25C6",
  billboard: "\uD83D\uDCCB",
  rooftop_sign: "\uD83D\uDD04",
  led_wrap: "\uD83D\uDCA1",
};

interface Props {
  ad: {
    id: string;
    text: string;
    brand: string | null;
    vehicle: string;
    active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    impressions: number;
    clicks: number;
    cta_clicks: number;
    conversions: number;
  };
}

export function AdCard({ ad }: Props) {
  const now = new Date();
  const isExpired = ad.ends_at ? now > new Date(ad.ends_at) : false;
  const status = !ad.active && !ad.starts_at
    ? "pending"
    : ad.active && !isExpired
      ? "active"
      : "expired";

  const statusColors = { pending: "#f8d880", active: ACCENT, expired: "#888" };
  const ctr = ad.impressions > 0 ? ((ad.cta_clicks / ad.impressions) * 100).toFixed(2) : "0.00";

  return (
    <Link
      href={`/ads/dashboard/${ad.id}`}
      className="block border-[3px] border-border p-4 transition-colors hover:border-[#c8e64a33]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">{VEHICLE_ICONS[ad.vehicle] ?? "\u2708"}</span>
          <div>
            <p className="text-sm text-cream">{ad.brand || ad.text.slice(0, 30)}</p>
            <p className="mt-0.5 text-xs text-muted normal-case">{ad.vehicle.replace("_", " ")}</p>
          </div>
        </div>
        <span
          className="text-xs uppercase"
          style={{ color: statusColors[status] }}
        >
          {status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-base text-cream">{ad.impressions.toLocaleString()}</p>
          <p className="text-[10px] text-muted normal-case">impressions</p>
        </div>
        <div>
          <p className="text-base text-cream">{ad.cta_clicks.toLocaleString()}</p>
          <p className="text-[10px] text-muted normal-case">clicks</p>
        </div>
        <div>
          <p className="text-base text-cream">{ctr}%</p>
          <p className="text-[10px] text-muted normal-case">CTR</p>
        </div>
        <div>
          <p className="text-base text-cream">{ad.conversions.toLocaleString()}</p>
          <p className="text-[10px] text-muted normal-case">conversions</p>
        </div>
      </div>
    </Link>
  );
}
