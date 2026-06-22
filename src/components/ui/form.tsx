import type { ReactNode } from "react";

// Shared form primitives for admin pages — same pixel-art design system as
// PixelSelect. Import these instead of re-declaring input/label classes per page.

export const inputCls =
  "w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none transition-colors focus:border-lime";
export const labelCls = "mb-1.5 block text-[10px] uppercase tracking-wide text-muted";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {hint && <span className="text-dim normal-case"> · {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-border pb-1.5">
        <h3 className="text-[10px] uppercase tracking-wider text-cream-dark">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function NumField({ label, value, onChange, min, max }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[9px] uppercase text-muted">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime"
      />
    </div>
  );
}
