interface Props {
  contributions: number;
  repos: number;
  stars: number;
  kudos: number;
  visits: number;
  referrals: number;
  accent: string;
}

export default function ProfileStats({
  contributions,
  repos,
  stars,
  kudos,
  visits,
  referrals,
  accent,
}: Props) {
  const stats = [
    { label: "Contributions", value: contributions },
    { label: "Repos", value: repos },
    { label: "Stars", value: stars },
    { label: "+1s", value: kudos },
    { label: "Visits", value: visits },
    { label: "Referrals", value: referrals },
  ];

  return (
    <section className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border-[3px] border-border bg-bg-card p-2.5 text-center"
        >
          <div className="text-base" style={{ color: accent }}>
            {stat.value.toLocaleString()}
          </div>
          <div className="mt-1 text-[8px] text-muted">{stat.label}</div>
        </div>
      ))}
    </section>
  );
}
