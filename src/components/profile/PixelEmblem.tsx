// Pixel-art tier emblems drawn as SVG rects — no emojis, no image assets.
// Chars: h = highlight, b = base, d = shadow, "." = empty.

interface Palette {
  h: string;
  b: string;
  d: string;
}

const PALETTES: Record<string, Palette> = {
  bronze: { h: "#e3a05c", b: "#cd7f32", d: "#8a5420" },
  silver: { h: "#ececf0", b: "#c0c0c0", d: "#7c7c88" },
  gold: { h: "#ffe88a", b: "#ffd700", d: "#b08c00" },
  diamond: { h: "#eafcff", b: "#b9f2ff", d: "#5fb9d6" },
};

// Bronze — rank chevron
const CHEVRON = [
  ".....h.....",
  "....hbb....",
  "...hbbbd...",
  "..hbbbbbd..",
  ".hbbb.bbbd.",
  "hbbb...bbbd",
  "hbb.....bbd",
];

// Silver — shield
const SHIELD = [
  "hhhhbbbbbdd",
  "hhbbbbbbbdd",
  "hbbbbbbbbbd",
  "hbbbbbbbbbd",
  ".hbbbbbbbd.",
  ".hbbbbbbbd.",
  "..bbbbbbd..",
  "...bbbbd...",
  "....bbd....",
  ".....b.....",
];

// Gold — star
const STAR = [
  ".....h.....",
  "....hbb....",
  "....hbb....",
  "hhhhhbbbddd",
  ".hhbbbbbdd.",
  "..hbbbbbd..",
  "...bbbbd...",
  "..bbbbbbb..",
  "..bbb.ddd..",
  "..b.....d..",
];

// Diamond — faceted gem
const GEM = [
  "..hhhbbbb..",
  ".hhhbbbbbd.",
  "hhbbbbbbbdd",
  ".hbbbbbbdd.",
  "..bbbbbdd..",
  "...bbbdd...",
  "....bdd....",
  ".....d.....",
];

const SHAPES: Record<string, string[]> = {
  bronze: CHEVRON,
  silver: SHIELD,
  gold: STAR,
  diamond: GEM,
};

interface Props {
  tier: string;
  /** Rendered width in px; height follows the shape's aspect ratio. */
  size?: number;
}

export default function PixelEmblem({ tier, size = 40 }: Props) {
  const rows = SHAPES[tier] ?? SHAPES.bronze;
  const palette = PALETTES[tier] ?? PALETTES.bronze;
  const w = rows[0].length;
  const h = rows.length;

  return (
    <svg
      width={size}
      height={Math.round((size * h) / w)}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={palette[c as keyof Palette]}
            />
          )
        )
      )}
    </svg>
  );
}
