import type { CSSProperties } from "react";

export type Currency = "pixels" | "gitc";

/** Pixel-art icons for the two in-game currencies. Vector (SVG), crisp at any size. */
const ICON_SRC: Record<Currency, string> = {
  pixels: "/currencies/pixels.svg",
  gitc: "/currencies/gitc.svg",
};

const ICON_ALT: Record<Currency, string> = {
  pixels: "Pixels",
  gitc: "GITC",
};

interface Props {
  currency: Currency;
  /** Rendered width/height in px. Default 16. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function CurrencyIcon({ currency, size = 16, className, style }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static pixel-art icon, no optimization needed
    <img
      src={ICON_SRC[currency]}
      width={size}
      height={size}
      alt={ICON_ALT[currency]}
      draggable={false}
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
    />
  );
}
