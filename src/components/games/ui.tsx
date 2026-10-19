"use client";

// The car games' pieces (drift, city races, Crown Rush), after motorsport
// TV graphics: opaque square bands with no border and a hard edge below, the
// lime one with dark type like the start gantry's sign. Menus blur and
// darken the scene behind them so the bands carry the contrast; the driving
// HUD sits on the scene as is.

import type { CSSProperties, ReactNode } from "react";

export type Tone = "dark" | "lime" | "cream" | "red" | "orange" | "gold";

const TONE: Record<Tone, string> = {
  dark: "bg-[#141417] text-cream",
  lime: "bg-lime text-bg",
  cream: "bg-cream text-bg",
  red: "bg-[#ff5a52] text-bg",
  orange: "bg-[#ff9a3c] text-bg",
  gold: "bg-[#ffcf33] text-bg",
};

/** One band. `delay` (ms) staggers its slide in; `tab` puts a colored edge on its left. */
export function Band({
  tone = "dark",
  delay,
  tab,
  animate = true,
  className = "",
  style,
  children,
}: {
  tone?: Tone;
  delay?: number;
  tab?: string;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      className={`${animate ? "drift-band" : ""} inline-flex items-center shadow-[0_6px_0_rgba(0,0,0,0.35)] ${TONE[tone]} ${className}`}
      style={{ animationDelay: delay !== undefined ? `${delay}ms` : undefined, borderLeft: tab ? `8px solid ${tab}` : undefined, ...style }}
    >
      {children}
    </span>
  );
}

/** A key inside a band: a small cream chip with dark type. */
export function Chip({ children, tone = "cream" }: { children: ReactNode; tone?: "cream" | "dark" }) {
  return (
    <span className={`inline-flex items-center px-[0.5em] py-[0.15em] text-[0.8em] leading-none ${tone === "cream" ? "bg-cream text-bg" : "bg-bg text-cream"}`}>
      {children}
    </span>
  );
}

/** The scene behind a menu, blurred and darkened: the bands own the contrast. */
export function Backdrop({ side }: { side?: "left" | "right" }) {
  const shade =
    side === "left"
      ? "linear-gradient(to right, rgba(13,13,15,0.72), rgba(13,13,15,0.35) 60%, rgba(13,13,15,0.2))"
      : side === "right"
        ? "linear-gradient(to left, rgba(13,13,15,0.72), rgba(13,13,15,0.35) 60%, rgba(13,13,15,0.2))"
        : "rgba(13,13,15,0.5)";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 animate-[drift-blur-in_0.35s_ease-out_both] backdrop-blur-[10px]"
      style={{ background: shade }}
    />
  );
}
