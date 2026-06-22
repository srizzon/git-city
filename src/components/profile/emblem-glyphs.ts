// Finite pixel-glyph library for emblems.
//
// The emblems system is data-driven: a catalog row names a `glyph` (a string
// key) and the renderer looks it up here. A finite library of icons in code
// crossed with an unbounded catalog in data = a new, distinct emblem with no
// new art. Each glyph is an 11x11 char grid: "x" = ink (drawn), "." = empty.
//
// Keep every grid EXACTLY 11 rows x 11 columns — EmblemBadge assumes it.
// Adding a glyph = add one entry here, then any emblem row can reference it.

export const GLYPH_SIZE = 11;

export const EMBLEM_GLYPHS: Record<string, string[]> = {
  // git commit node (commits family)
  "commit-node": [
    "...........",
    "....xxx....",
    "..xx...xx..",
    ".x.......x.",
    ".x..xxx..x.",
    ".x..xxx..x.",
    ".x..xxx..x.",
    ".x.......x.",
    "..xx...xx..",
    "....xxx....",
    "...........",
  ],
  // stacked boxes (repos family)
  blocks: [
    "...........",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    "...........",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    "...........",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    "...........",
    "...........",
  ],
  // star (stars family)
  star: [
    ".....x.....",
    "....xxx....",
    "....xxx....",
    "xxxxxxxxxxx",
    ".xxxxxxxxx.",
    "..xxxxxxx..",
    "..xxxxxxx..",
    ".xxx.x.xxx.",
    ".xx.....xx.",
    ".x.......x.",
    "...........",
  ],
  // two figures (social / referrals family)
  people: [
    "...........",
    "..x.....x..",
    ".xxx...xxx.",
    ".xxx...xxx.",
    "..x.....x..",
    "xxxxx.xxxxx",
    "xxxxx.xxxxx",
    "xxxxx.xxxxx",
    "xxxxx.xxxxx",
    "...........",
    "...........",
  ],
  // heart (kudos family)
  heart: [
    "...........",
    "..xx...xx..",
    ".xxxx.xxxx.",
    "xxxxxxxxxxx",
    "xxxxxxxxxxx",
    "xxxxxxxxxxx",
    ".xxxxxxxxx.",
    "..xxxxxxx..",
    "...xxxxx...",
    "....xxx....",
    ".....x.....",
  ],
  // wrapped present (gifts family)
  gift: [
    "...........",
    "....x.x....",
    "...xx.xx...",
    ".xxxxxxxxx.",
    ".x..x.x..x.",
    ".xxxxxxxxx.",
    ".x..x.x..x.",
    ".x..x.x..x.",
    ".x..x.x..x.",
    ".xxxxxxxxx.",
    "...........",
  ],
  // flame (streak family)
  flame: [
    ".....x.....",
    "....xx.....",
    "....xxx....",
    "...xxxx....",
    "...xxxxx...",
    "..xxx.xxx..",
    "..xx...xx..",
    "..xx.x.xx..",
    "..xxxxxxx..",
    "...xxxxx...",
    "....xxx....",
  ],
  // sword (raid family)
  sword: [
    ".....x.....",
    "....xxx....",
    "....xxx....",
    "....xxx....",
    "....xxx....",
    "....xxx....",
    "..xxxxxxx..",
    "....xxx....",
    "....xxx....",
    "....xxx....",
    "...........",
  ],
  // calendar (dailies family)
  calendar: [
    "...........",
    "..x.....x..",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    ".x.......x.",
    ".x.x.x.x.x.",
    ".x.......x.",
    ".x.x.x.x.x.",
    ".x.......x.",
    ".xxxxxxxxx.",
    "...........",
  ],
  // briefcase (jobs family)
  briefcase: [
    "...........",
    "....xxx....",
    "...x...x...",
    ".xxxxxxxxx.",
    ".x.......x.",
    ".x...x...x.",
    ".xxxxxxxxx.",
    ".x.......x.",
    ".x.......x.",
    ".xxxxxxxxx.",
    "...........",
  ],
  // rabbit (secret / discovery)
  rabbit: [
    "..x.....x..",
    "..x.x.x.x..",
    "..x.x.x.x..",
    "..xxxxxxx..",
    ".xxxxxxxxx.",
    "xxxxxxxxxxx",
    "xxx.xxx.xxx",
    "xxxxxxxxxxx",
    ".xxxxxxxxx.",
    "..xx...xx..",
    "...........",
  ],
  // crown (event champion #1)
  crown: [
    "...........",
    "..x.....x..",
    "..x..x..x..",
    "..xx.x.xx..",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    ".xxxx.xxxx.",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    "...........",
    "...........",
  ],
  // ribboned medallion (veteran / podium)
  medal: [
    "..x.....x..",
    "..x.....x..",
    "..xx...xx..",
    "...xx.xx...",
    "...xxxxx...",
    "..xxxxxxx..",
    "..xxx.xxx..",
    "..xxxxxxx..",
    "...xxxxx...",
    "...........",
    "...........",
  ],
  // trophy (generic top honor)
  trophy: [
    "...........",
    ".xxxxxxxxx.",
    "x.xxxxxxx.x",
    "x.xxxxxxx.x",
    ".xxxxxxxxx.",
    "..xxxxxxx..",
    "....xxx....",
    "....xxx....",
    "...xxxxx...",
    "..xxxxxxx..",
    "...........",
  ],
  // rosette (event featured / honourable mention)
  ribbon: [
    "...........",
    "...xxxxx...",
    "..xxxxxxx..",
    "..xxx.xxx..",
    "..xxxxxxx..",
    "...xxxxx...",
    "...x...x...",
    "..x.....x..",
    "..x.....x..",
    "..xx...xx..",
    "...........",
  ],
  // beetle (live-event theme, e.g. Bug Invasion)
  bug: [
    "...........",
    "..x.....x..",
    "...x...x...",
    "..xxxxxxx..",
    ".x.xxxxx.x.",
    "xxxxxxxxxxx",
    ".x.xxxxx.x.",
    "..xxxxxxx..",
    "...x...x...",
    "..x.....x..",
    "...........",
  ],
  // burst (special / branded fallback)
  sparkle: [
    ".....x.....",
    ".....x.....",
    "....xxx....",
    ".x..xxx..x.",
    ".xxxxxxxxx.",
    "xxxxxxxxxxx",
    ".xxxxxxxxx.",
    ".x..xxx..x.",
    "....xxx....",
    ".....x.....",
    ".....x.....",
  ],
  // duck — head + eye + beak (right), body (Duck Boss event)
  duck: [
    "...........",
    "....xxx....",
    "...xxxxx...",
    "...xx.xx...",
    "...xxxxxxx.",
    "....xxx....",
    "..xxxxxxx..",
    ".xxxxxxxxx.",
    ".xxxxxxxxx.",
    "..xxxxxxx..",
    "...........",
  ],
};

// Fallback when an emblem references an unknown glyph (forward-compatible:
// a catalog row added before its art lands still renders something sane).
export const DEFAULT_GLYPH = "sparkle";

export function resolveGlyph(glyph: string | null | undefined): string[] {
  return EMBLEM_GLYPHS[glyph ?? ""] ?? EMBLEM_GLYPHS[DEFAULT_GLYPH];
}
