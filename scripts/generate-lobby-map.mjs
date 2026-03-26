/**
 * Generates lobby map JSON (30x22) - Lumon-inspired layout v2
 *
 * Zones top-to-bottom:
 * - Work zone (rows 1-6): desks + PCs near elevator
 * - Half wall divider (row 7): separates work from social
 * - Social center (rows 8-12): big communal table
 * - Couch nooks (rows 13-16): conversation pits on rugs
 * - Coffee counter (rows 17-19): social anchor near entrance
 * - Entrance (row 21): door
 *
 * Run: node scripts/generate-lobby-map.mjs
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 30;
const H = 22;
const TS = 32;

// Tile IDs (from generate-tileset.mjs)
const _ = 0;   // empty
const CA = 1;  // carpet A (default)
const CB = 2;  // carpet B (work zone)
const RG = 3;  // rug
const WH = 4;  // wall horizontal
const WL = 5;  // wall left
const WR = 6;  // wall right
const DR = 7;  // door
const TF = 8;  // tile floor
const HW = 9;  // half wall

// ── GROUND LAYER (30x22) ──
const ground = [
  // Row 0: top wall
  WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,
  // Row 1-6: work zone (carpet B) + tile near elevator
  WL,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,TF,TF,TF,TF,TF,TF,TF,TF,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,WR,
  WL,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,TF,TF,TF,TF,TF,TF,TF,TF,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,WR,
  WL,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,WR,
  WL,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,WR,
  WL,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,WR,
  WL,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,CB,WR,
  // Row 7: half wall divider (opening in center cols 11-18)
  WL,HW,HW,HW,HW,HW,HW,HW,HW,HW,HW,CA,CA,CA,CA,CA,CA,CA,CA,HW,HW,HW,HW,HW,HW,HW,HW,HW,HW,WR,
  // Row 8-12: social center (carpet A)
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  // Row 13-16: couch nooks with rugs
  WL,CA,RG,RG,RG,RG,RG,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,RG,RG,RG,RG,RG,CA,WR,
  WL,CA,RG,RG,RG,RG,RG,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,RG,RG,RG,RG,RG,CA,WR,
  WL,CA,RG,RG,RG,RG,RG,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,RG,RG,RG,RG,RG,CA,WR,
  WL,CA,RG,RG,RG,RG,RG,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,RG,RG,RG,RG,RG,CA,WR,
  // Row 17-19: coffee counter area
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  // Row 20: space before entrance
  WL,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,CA,WR,
  // Row 21: bottom wall with door
  WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,DR,DR,DR,DR,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,WH,
];

// ── FURNITURE ──
const furniture = [
  // ── WORK STATIONS (rows 3-5) ──
  // Left pair
  { sprite: "DESK_FRONT", col: 3, row: 3, fw: 3, fh: 2, collides: true, sw: 48, sh: 32 },
  { sprite: "DESK_FRONT", col: 7, row: 3, fw: 3, fh: 2, collides: true, sw: 48, sh: 32 },
  { sprite: "PC_FRONT",   col: 4, row: 3, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "PC_FRONT",   col: 8, row: 3, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "CHAIR_FRONT", col: 4, row: 5, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 8, row: 5, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // Right pair
  { sprite: "DESK_FRONT", col: 20, row: 3, fw: 3, fh: 2, collides: true, sw: 48, sh: 32 },
  { sprite: "DESK_FRONT", col: 24, row: 3, fw: 3, fh: 2, collides: true, sw: 48, sh: 32 },
  { sprite: "PC_FRONT",   col: 21, row: 3, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "PC_FRONT",   col: 25, row: 3, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "CHAIR_FRONT", col: 21, row: 5, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 25, row: 5, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // ── COMMUNAL TABLE (rows 9-11, center) ──
  { sprite: "SMALL_TABLE", col: 11, row: 9, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  { sprite: "SMALL_TABLE", col: 13, row: 9, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  { sprite: "SMALL_TABLE", col: 15, row: 9, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  { sprite: "SMALL_TABLE", col: 17, row: 9, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  // Chairs top side
  { sprite: "CHAIR_BACK",  col: 12, row: 9, fw: 1, fh: 1, collides: false, sw: 16, sh: 16, onSurface: true },
  { sprite: "CHAIR_BACK",  col: 14, row: 9, fw: 1, fh: 1, collides: false, sw: 16, sh: 16, onSurface: true },
  { sprite: "CHAIR_BACK",  col: 16, row: 9, fw: 1, fh: 1, collides: false, sw: 16, sh: 16, onSurface: true },
  // Chairs bottom side
  { sprite: "CHAIR_FRONT", col: 12, row: 11, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 14, row: 11, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 16, row: 11, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // ── LEFT COUCH NOOK (on rug) ──
  { sprite: "SOFA_FRONT",  col: 2, row: 13, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "SOFA_FRONT",  col: 2, row: 15, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "SMALL_TABLE", col: 4, row: 14, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  { sprite: "COFFEE",      col: 5, row: 14, fw: 1, fh: 1, collides: false, sw: 16, sh: 16, onSurface: true },

  // ── RIGHT COUCH NOOK (on rug, no coffee - asymmetry) ──
  { sprite: "SOFA_FRONT",  col: 24, row: 13, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "SOFA_FRONT",  col: 24, row: 15, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "SMALL_TABLE", col: 26, row: 14, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },

  // ── COFFEE COUNTER (near entrance) ──
  { sprite: "SMALL_TABLE", col: 3, row: 18, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  { sprite: "SMALL_TABLE", col: 5, row: 18, fw: 2, fh: 2, collides: true, sw: 32, sh: 32 },
  { sprite: "COFFEE",      col: 4, row: 18, fw: 1, fh: 1, collides: false, sw: 16, sh: 16, onSurface: true },
  { sprite: "COFFEE",      col: 6, row: 18, fw: 1, fh: 1, collides: false, sw: 16, sh: 16, onSurface: true },
  { sprite: "CHAIR_FRONT", col: 4, row: 19, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 6, row: 19, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // ── DECORATIONS ──
  // Plants (4 corners - Lumon symmetry)
  { sprite: "PLANT", col: 1, row: 1, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },
  { sprite: "PLANT", col: 28, row: 1, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },
  { sprite: "PLANT", col: 1, row: 19, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },
  { sprite: "PLANT", col: 28, row: 19, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },
  // Plants flanking elevator
  { sprite: "PLANT", col: 11, row: 1, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },
  { sprite: "PLANT", col: 18, row: 1, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },

  // Bookshelves on top wall
  { sprite: "BOOKSHELF", col: 3, row: 1, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "BOOKSHELF", col: 6, row: 1, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "BOOKSHELF", col: 23, row: 1, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },
  { sprite: "BOOKSHELF", col: 26, row: 1, fw: 2, fh: 1, collides: true, sw: 32, sh: 16 },

  // Wall decorations - placed ON wall tiles
  // Whiteboard on top wall (between elevator plants, col 9)
  { sprite: "WHITEBOARD", col: 9, row: 0, fw: 2, fh: 1, collides: true, sw: 32, sh: 32, onSurface: true },
  // Painting on top wall (right side, col 20)
  { sprite: "LARGE_PAINTING", col: 20, row: 0, fw: 2, fh: 1, collides: true, sw: 32, sh: 32, onSurface: true },
  // Small painting on left wall (below the half wall, row 12)
  { sprite: "SMALL_PAINTING", col: 0, row: 12, fw: 1, fh: 1, collides: true, sw: 16, sh: 32, onSurface: true },

  // Clock on right wall (row 12, symmetric with left painting)
  { sprite: "CLOCK", col: 29, row: 12, fw: 1, fh: 1, collides: true, sw: 16, sh: 32, onSurface: true },

  // Bin near entrance
  { sprite: "BIN", col: 20, row: 19, fw: 1, fh: 1, collides: true, sw: 16, sh: 16 },

  // ── ELEVATOR (custom sprite, back wall center) ──
  { sprite: "ELEVATOR", col: 13, row: 0, fw: 4, fh: 1, collides: true, sw: 0, sh: 0 },
];

// ── COLLISION ──
const collision = new Array(W * H).fill(0);
// Block walls, half walls, doors stay walkable
for (let i = 0; i < ground.length; i++) {
  const t = ground[i];
  if (t === WH || t === WL || t === WR || t === HW) collision[i] = 1;
}
// Block furniture
for (const f of furniture) {
  if (!f.collides) continue;
  for (let r = f.row; r < f.row + f.fh; r++)
    for (let c = f.col; c < f.col + f.fw; c++)
      if (r >= 0 && r < H && c >= 0 && c < W) collision[r * W + c] = 1;
}

// ── SPAWNS ──
const spawns = [];
for (let c = 0; c < W; c++)
  if (ground[21 * W + c] === DR) spawns.push({ type: "spawn", x: c, y: 21 });

// ── Pre-compute desk sortY ──
const deskSortByTile = new Map();
for (const f of furniture) {
  if (f.sprite.includes("DESK") || f.sprite.includes("TABLE")) {
    const deskSortY = (f.row + f.fh) * TS;
    for (let r = f.row; r < f.row + f.fh; r++)
      for (let c = f.col; c < f.col + f.fw; c++)
        deskSortByTile.set(`${c},${r}`, deskSortY);
  }
}

// ── Serialize ──
const furnitureOut = furniture.map((f, i) => {
  const renderH = f.sh * 2;
  const footprintBottom = (f.row + f.fh) * TS;
  let sortY = footprintBottom;
  let yOffset = 0;

  if (f.onSurface) {
    const deskZ = deskSortByTile.get(`${f.col},${f.row}`);
    if (deskZ !== undefined) sortY = deskZ + 0.5;
    yOffset = TS;
  }

  return {
    id: `f-${i}`,
    sprite: f.sprite,
    x: f.col * TS,
    y: footprintBottom - renderH + yOffset,
    width: f.fw * TS,
    height: f.fh * TS,
    collides: f.collides,
    sortY,
  };
});

const map = {
  name: "lobby",
  width: W,
  height: H,
  tileSize: TS,
  tileset: "/sprites/arcade-tileset.png",
  tilesetColumns: 16,
  layers: { ground, collision, abovePlayer: new Array(W * H).fill(0) },
  furniture: furnitureOut,
  objects: [
    ...spawns,
    { type: "elevator", x: 14, y: 0, width: 4, label: "Elevator" },
    // Interactable wall objects
    { type: "quote", x: 9, y: 1, width: 2, label: "Whiteboard" },
    { type: "quote", x: 20, y: 1, width: 2, label: "Painting" },
    { type: "quote", x: 1, y: 12, label: "Painting" },
    { type: "quote", x: 28, y: 12, label: "Clock" },
    // Seats - player sits ON the chair tile, facing the direction of the chair
    // Work desk chairs (chair faces UP toward desk)
    { type: "seat", x: 4, y: 5, dir: "up" },
    { type: "seat", x: 8, y: 5, dir: "up" },
    { type: "seat", x: 21, y: 5, dir: "up" },
    { type: "seat", x: 25, y: 5, dir: "up" },
    // Communal table - bottom chairs (chair faces DOWN)
    { type: "seat", x: 12, y: 11, dir: "down" },
    { type: "seat", x: 14, y: 11, dir: "down" },
    { type: "seat", x: 16, y: 11, dir: "down" },
    // Coffee counter chairs (chair faces DOWN)
    { type: "seat", x: 4, y: 19, dir: "down" },
    { type: "seat", x: 6, y: 19, dir: "down" },
  ],
};

const outPath = join(__dirname, "..", "public", "maps", "lobby.json");
writeFileSync(outPath, JSON.stringify(map));

const blocked = collision.filter(c => c === 1).length;
console.log(`Saved: ${outPath}`);
console.log(`Map: ${W}x${H}, ${furniture.length} furniture, ${spawns.length} spawns`);
console.log(`Collision: ${blocked} blocked, ${W * H - blocked} walkable`);
