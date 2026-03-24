const ACCENT = "#c8e64a";

interface Props {
  current: number;
  total: number;
  label?: string;
}

export function ProgressBar({ current, total, label }: Props) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  return (
    <div>
      {label && <p className="mb-1 text-xs text-muted normal-case">{label}</p>}
      <div className="h-3 w-full overflow-hidden border-[2px] border-border">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: ACCENT }}
        />
      </div>
      <p className="mt-1 text-xs text-muted normal-case">
        {current.toLocaleString()} / {total.toLocaleString()} ({pct.toFixed(0)}%)
      </p>
    </div>
  );
}
