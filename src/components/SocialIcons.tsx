// Pixel-art social icons drawn on a 12x12 grid, rendered as a single SVG path
// with crisp edges so they read like Silkscreen glyphs. No icon library —
// lucide's brand icons are deprecated and its rounded strokes clash with the
// city's pixel identity.

import type { SocialPlatform } from "@/lib/social-links";

type IconName = SocialPlatform | "github" | "pencil";

// '#' = filled pixel. Each glyph is 12 rows x 12 cols.
const GLYPHS: Record<IconName, string[]> = {
  github: [
    "..#......#..",
    ".###....###.",
    ".##########.",
    "############",
    "###..##..###",
    "###..##..###",
    "############",
    "############",
    ".##########.",
    "..########..",
    "..###..###..",
    "............",
  ],
  linkedin: [
    "############",
    "############",
    "############",
    "###.########",
    "############",
    "###.##...###",
    "###.##.#.###",
    "###.##.#.###",
    "###.##.#.###",
    "############",
    "############",
    "############",
  ],
  twitter: [
    "##........##",
    "###......###",
    ".###....###.",
    "..###..###..",
    "...######...",
    "....####....",
    "....####....",
    "...######...",
    "..###..###..",
    ".###....###.",
    "###......###",
    "##........##",
  ],
  youtube: [
    "............",
    ".##########.",
    "############",
    "#####.######",
    "#####..#####",
    "#####...####",
    "#####...####",
    "#####..#####",
    "#####.######",
    "############",
    ".##########.",
    "............",
  ],
  website: [
    "....####....",
    "..##.##.##..",
    ".##.####.##.",
    ".##.####.##.",
    "##.######.##",
    "##........##",
    "##.######.##",
    ".##.####.##.",
    ".##.####.##.",
    "..##.##.##..",
    "..########..",
    "....####....",
  ],
  email: [
    "............",
    "............",
    "############",
    "#.########.#",
    "##.######.##",
    "###.####.###",
    "####.##.####",
    "#####..#####",
    "############",
    "############",
    "############",
    "............",
  ],
  pencil: [
    "........###.",
    ".......####.",
    "......#####.",
    ".....#####..",
    "....#####...",
    "...#####....",
    "..#####.....",
    ".#####......",
    ".####.......",
    ".###........",
    ".#..........",
    "............",
  ],
};

function glyphPath(rows: string[]): string {
  let d = "";
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === "#") d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

const PATHS = Object.fromEntries(
  (Object.keys(GLYPHS) as IconName[]).map((name) => [name, glyphPath(GLYPHS[name])])
) as Record<IconName, string>;

export const SOCIAL_LABELS: Record<IconName, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  twitter: "X",
  youtube: "YouTube",
  website: "Website",
  email: "Email",
  pencil: "Edit",
};

// Tooltip text: platform name, except website/email where the actual
// destination is more informative than the generic label.
function chipLabel(name: IconName, href: string): string {
  if (name === "email") return href.replace(/^mailto:/, "");
  if (name === "website") {
    try {
      return new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return SOCIAL_LABELS[name];
    }
  }
  return SOCIAL_LABELS[name];
}

export function PixelSocialIcon({ name, size = 12 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden
      focusable={false}
    >
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}

/** Square chip wrapping a pixel icon — the shared link style for profile + city card. */
export function SocialLinkChip({
  name,
  href,
  size = 28,
  className = "",
  hoverColor,
}: {
  name: IconName;
  href: string;
  size?: number;
  className?: string;
  hoverColor?: string;
}) {
  const isMailto = href.startsWith("mailto:");
  return (
    <a
      href={href}
      {...(isMailto ? {} : { target: "_blank", rel: "noopener noreferrer nofollow ugc" })}
      aria-label={SOCIAL_LABELS[name]}
      className={`group relative inline-flex shrink-0 items-center justify-center border-2 border-border-light bg-bg/40 text-muted transition-colors btn-press hover:border-[color:var(--chip-hover)] hover:text-[color:var(--chip-hover)] ${className}`}
      style={
        {
          width: size,
          height: size,
          "--chip-hover": hoverColor ?? "var(--color-lime)",
        } as React.CSSProperties
      }
    >
      {/* Icon size must be an integer multiple of the 12px glyph grid or the
          browser rounds cells unevenly and the pixel art goes muddy. */}
      <PixelSocialIcon name={name} size={size >= 48 ? 24 : 12} />
      {/* Pixel tooltip — pure CSS, replaces the slow native title */}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap border-2 border-border-light bg-bg px-1.5 py-0.5 text-[8px] normal-case tracking-wider text-cream group-hover:block group-focus-visible:block"
        role="tooltip"
      >
        {chipLabel(name, href)}
      </span>
    </a>
  );
}
