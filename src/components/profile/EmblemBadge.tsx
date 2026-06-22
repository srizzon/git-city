// EmblemBadge — the data-driven emblem renderer.
//
// Composition (per the emblems design): frame(tier) + glyph(data) + number(if counter).
//   - frame/bevel: derived from `tier` (4 fixed palettes, mirrors achievement-tiers)
//   - glyph:       looked up by name from the finite EMBLEM_GLYPHS library
//   - number:      a live counter overlaid in the corner when the emblem counts
//
// Pure SVG <rect> grid (pixel-art aesthetic), no 3D, no image assets, no deps.
// Branded/image emblems (render_kind='image') are a later addition — not here yet.

import { resolveGlyph, GLYPH_SIZE } from "./emblem-glyphs";

interface Palette {
  h: string; // highlight (glyph ink — lightest)
  b: string; // base (frame — mid)
  d: string; // shadow (inner background — darkest)
}

export const TIER_PALETTES: Record<string, Palette> = {
  bronze: { h: "#e3a05c", b: "#cd7f32", d: "#5e3a16" },
  silver: { h: "#ececf0", b: "#c0c0c0", d: "#565660" },
  gold: { h: "#ffe88a", b: "#ffd700", d: "#7a5f00" },
  diamond: { h: "#eafcff", b: "#b9f2ff", d: "#2f6f86" },
};

interface Props {
  tier: string;
  glyph: string | null | undefined;
  /** Live count for counter emblems (Veteran "10", placements "3×"). */
  count?: number;
  /** Show the count overlay (true for is_counter emblems). */
  showCount?: boolean;
  /** Rendered width/height in px (square). */
  size?: number;
}

export default function EmblemBadge({
  tier,
  glyph,
  count,
  showCount = false,
  size = 40,
}: Props) {
  const palette = TIER_PALETTES[tier] ?? TIER_PALETTES.bronze;
  const rows = resolveGlyph(glyph);
  // Canvas: 11x11 glyph inset by 1px inside a 13x13 framed badge.
  const VB = GLYPH_SIZE + 2; // 13

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        lineHeight: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VB} ${VB}`}
        shapeRendering="crispEdges"
        aria-hidden
      >
        {/* frame */}
        <rect x={0} y={0} width={VB} height={VB} rx={1.5} fill={palette.b} />
        {/* inner background */}
        <rect x={1} y={1} width={GLYPH_SIZE} height={GLYPH_SIZE} fill={palette.d} />
        {/* glyph, drawn in the highlight ink, offset into the inner area */}
        {rows.flatMap((row, y) =>
          [...row].map((c, x) =>
            c === "x" ? (
              <rect
                key={`${x}-${y}`}
                x={x + 1}
                y={y + 1}
                width={1}
                height={1}
                fill={palette.h}
              />
            ) : null,
          ),
        )}
      </svg>

      {showCount && typeof count === "number" && count > 0 && (
        <span
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            minWidth: Math.round(size * 0.42),
            height: Math.round(size * 0.42),
            padding: "0 3px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            background: "#0f0f12",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.25)",
            fontSize: Math.max(9, Math.round(size * 0.26)),
            fontWeight: 700,
            lineHeight: 1,
            boxSizing: "border-box",
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}
