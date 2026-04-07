// ─── Room Themes ─────────────────────────────────────────────
// Uses /cozy/tileset-interior.png (wallpapers.png from Cozy Interior)
// Tileset: 40 columns × 51 rows, 16×16 tiles
// GID formula: row * 40 + col

const COLS = 40; // tileset columns

function gid(row: number, col: number): number {
  return row * COLS + col;
}

// ─── Border colors ───────────────────────────────────────────
// Cols 0-6, each color occupies 2 rows (top border, bottom border)
// with 1 empty row gap between colors.
// Row pattern: empty, color_0_top, color_0_bot, empty, color_1_top, ...
// Starting at row 1, each color spans rows: 1+i*3, 2+i*3

interface BorderColor {
  name: string;
  topRow: number;   // row for top corners/edges
  botRow: number;   // row for bottom corners/edges
}

const BORDER_COLORS: BorderColor[] = [
  { name: "Brown",       topRow: 1,  botRow: 2  },
  { name: "Beige",       topRow: 4,  botRow: 5  },
  { name: "Olive",       topRow: 7,  botRow: 8  },
  { name: "Navy",        topRow: 10, botRow: 11 },
  { name: "Mahogany",    topRow: 13, botRow: 14 },
  { name: "Gray",        topRow: 16, botRow: 17 },
  { name: "Teal",        topRow: 19, botRow: 20 },
  { name: "Dark Teal",   topRow: 22, botRow: 23 },
  { name: "Orange",      topRow: 25, botRow: 26 },
  { name: "Red",         topRow: 28, botRow: 29 },
  { name: "Slate",       topRow: 31, botRow: 32 },
  { name: "Purple",      topRow: 34, botRow: 35 },
  { name: "Dark Brown",  topRow: 37, botRow: 38 },
  { name: "Rust",        topRow: 40, botRow: 41 },
  { name: "Indigo",      topRow: 43, botRow: 44 },
  { name: "Gold",        topRow: 46, botRow: 47 },
  { name: "Chocolate",   topRow: 49, botRow: 50 },
];

// ─── Floor tiles ─────────────────────────────────────────────
// Rows 40-43 of the tileset, cols 7+
interface FloorStyle {
  name: string;
  gid: number; // single tile GID to fill the floor
}

const FLOOR_STYLES: FloorStyle[] = [
  // Row 40: Brick pattern floors
  { name: "Brick Brown",    gid: gid(40, 7)  },
  { name: "Brick Tan",      gid: gid(40, 8)  },
  { name: "Brick Gray",     gid: gid(40, 9)  },
  { name: "Brick Teal",     gid: gid(40, 10) },
  { name: "Brick Dark",     gid: gid(40, 11) },
  { name: "Brick Green",    gid: gid(40, 14) },
  { name: "Brick Pink",     gid: gid(40, 15) },
  { name: "Brick Orange",   gid: gid(40, 16) },
  // Row 41: Solid/plain floors
  { name: "Wood Light",     gid: gid(41, 7)  },
  { name: "Wood Medium",    gid: gid(41, 8)  },
  { name: "Wood Brown",     gid: gid(41, 9)  },
  { name: "Wood Dark",      gid: gid(41, 10) },
  { name: "Stone Gray",     gid: gid(41, 11) },
  { name: "Stone Teal",     gid: gid(41, 12) },
  { name: "Carpet Pink",    gid: gid(41, 13) },
  { name: "Carpet Orange",  gid: gid(41, 14) },
  { name: "Carpet Green",   gid: gid(41, 17) },
  { name: "Carpet Blue",    gid: gid(41, 18) },
  // Row 42: Patterned floors
  { name: "Check Warm",     gid: gid(42, 7)  },
  { name: "Check Brown",    gid: gid(42, 8)  },
  { name: "Check Red",      gid: gid(42, 9)  },
  { name: "Check Teal",     gid: gid(42, 10) },
  { name: "Check Green",    gid: gid(42, 14) },
  // Row 43: Decorative floors
  { name: "Mosaic Warm",    gid: gid(43, 7)  },
  { name: "Mosaic Brown",   gid: gid(43, 8)  },
  { name: "Mosaic Red",     gid: gid(43, 9)  },
  { name: "Mosaic Teal",    gid: gid(43, 10) },
];

// ─── Wall patterns ───────────────────────────────────────────
// Cols 7+, various rows. Each wall pattern is a single tile to fill the upper wall area.
interface WallPattern {
  name: string;
  gid: number;
}

const WALL_PATTERNS: WallPattern[] = [
  // Solid/simple fills (from col 5 of different border colors, or row 30+ textures)
  { name: "Solid (use border)",   gid: -1 }, // Special: uses border fill col 5
  // Brick patterns (rows 30-31)
  { name: "Brick Dark",          gid: gid(30, 7)  },
  { name: "Brick Brown",         gid: gid(30, 8)  },
  { name: "Brick Red",           gid: gid(30, 9)  },
  { name: "Brick Gray",          gid: gid(30, 10) },
  // Wood patterns (rows 36-39)
  { name: "Wood Plank Light",    gid: gid(36, 7)  },
  { name: "Wood Plank Medium",   gid: gid(37, 7)  },
  { name: "Wood Plank Dark",     gid: gid(38, 7)  },
  { name: "Wood Plank Rich",     gid: gid(39, 7)  },
  // Stone/tile patterns (rows 34-35)
  { name: "Tile Light",          gid: gid(34, 7)  },
  { name: "Tile White",          gid: gid(34, 8)  },
  { name: "Tile Gray",           gid: gid(34, 9)  },
];

// ─── Room themes (pre-made combos) ──────────────────────────
export interface RoomTheme {
  id: string;
  name: string;
  borderColor: BorderColor;
  wallPattern: WallPattern;
  floorStyle: FloorStyle;
  /** How many tile rows the wall occupies from the top (including border) */
  wallHeight: number;
}

export const ROOM_THEMES: RoomTheme[] = [
  {
    id: "dark_bar",
    name: "Dark Bar",
    borderColor: BORDER_COLORS[12], // Dark Brown
    wallPattern: WALL_PATTERNS[1],  // Brick Dark
    floorStyle: FLOOR_STYLES[8],    // Wood Light
    wallHeight: 3,
  },
  {
    id: "cozy_lounge",
    name: "Cozy Lounge",
    borderColor: BORDER_COLORS[0],  // Brown
    wallPattern: WALL_PATTERNS[5],  // Wood Plank Light
    floorStyle: FLOOR_STYLES[9],    // Wood Medium
    wallHeight: 3,
  },
  {
    id: "teal_office",
    name: "Teal Office",
    borderColor: BORDER_COLORS[6],  // Teal
    wallPattern: WALL_PATTERNS[0],  // Solid
    floorStyle: FLOOR_STYLES[12],   // Stone Gray
    wallHeight: 3,
  },
  {
    id: "brick_arcade",
    name: "Brick Arcade",
    borderColor: BORDER_COLORS[9],  // Red
    wallPattern: WALL_PATTERNS[3],  // Brick Red
    floorStyle: FLOOR_STYLES[0],    // Brick Brown
    wallHeight: 4,
  },
  {
    id: "elegant_purple",
    name: "Elegant Purple",
    borderColor: BORDER_COLORS[11], // Purple
    wallPattern: WALL_PATTERNS[0],  // Solid
    floorStyle: FLOOR_STYLES[18],   // Check Warm
    wallHeight: 3,
  },
  {
    id: "navy_modern",
    name: "Navy Modern",
    borderColor: BORDER_COLORS[3],  // Navy
    wallPattern: WALL_PATTERNS[10], // Tile Gray
    floorStyle: FLOOR_STYLES[10],   // Wood Dark
    wallHeight: 3,
  },
  {
    id: "rustic_cabin",
    name: "Rustic Cabin",
    borderColor: BORDER_COLORS[0],  // Brown
    wallPattern: WALL_PATTERNS[7],  // Wood Plank Dark
    floorStyle: FLOOR_STYLES[1],    // Brick Tan
    wallHeight: 4,
  },
  {
    id: "golden_hall",
    name: "Golden Hall",
    borderColor: BORDER_COLORS[15], // Gold
    wallPattern: WALL_PATTERNS[0],  // Solid
    floorStyle: FLOOR_STYLES[23],   // Mosaic Warm
    wallHeight: 3,
  },
];

// ─── Map generator ───────────────────────────────────────────
export interface GeneratedMapData {
  ground: number[];
  collision: number[];
  abovePlayer: number[];
}

/**
 * Generate a room's tile layers from a theme and dimensions.
 * Creates: wall top border + wall fill + floor, with border frame.
 */
export function generateRoomTiles(
  theme: RoomTheme,
  width: number,
  height: number,
): GeneratedMapData {
  const ground = new Array(width * height).fill(0);
  const collision = new Array(width * height).fill(0);
  const abovePlayer = new Array(width * height).fill(0);

  const { borderColor, wallPattern, floorStyle, wallHeight } = theme;
  const { topRow, botRow } = borderColor;

  // GIDs for border pieces
  const TL = gid(topRow, 0);     // top-left corner
  const TR = gid(topRow, 1);     // top-right corner
  const BL = gid(botRow, 0);     // bottom-left corner
  const BR = gid(botRow, 1);     // bottom-right corner
  const TOP = gid(topRow, 3);    // top edge
  const BOT = gid(botRow, 3);    // bottom edge
  const LEFT_T = gid(topRow, 2); // left edge (top row variant)
  const LEFT_B = gid(botRow, 2); // left edge (bottom row variant)
  const RIGHT_T = gid(topRow, 4);// right edge (top row variant)
  const RIGHT_B = gid(botRow, 4);// right edge (bottom row variant)
  const FILL = wallPattern.gid === -1
    ? gid(topRow, 5)  // Use border's fill tile
    : wallPattern.gid;
  const FLOOR = floorStyle.gid;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const isLeft = x === 0;
      const isRight = x === width - 1;
      const isTop = y === 0;
      const isBottom = y === height - 1;
      const isWallArea = y < wallHeight;

      // Corners
      if (isTop && isLeft) {
        ground[idx] = TL;
        collision[idx] = 1;
      } else if (isTop && isRight) {
        ground[idx] = TR;
        collision[idx] = 1;
      } else if (isBottom && isLeft) {
        ground[idx] = BL;
        collision[idx] = 1;
      } else if (isBottom && isRight) {
        ground[idx] = BR;
        collision[idx] = 1;
      }
      // Edges
      else if (isTop) {
        ground[idx] = TOP;
        collision[idx] = 1;
      } else if (isBottom) {
        // Door opening in center
        const doorStart = Math.floor(width / 2) - 2;
        const doorEnd = doorStart + 4;
        if (x >= doorStart && x < doorEnd) {
          ground[idx] = FLOOR;
          collision[idx] = 0;
        } else {
          ground[idx] = BOT;
          collision[idx] = 1;
        }
      } else if (isLeft) {
        ground[idx] = isWallArea ? LEFT_T : LEFT_B;
        collision[idx] = 1;
      } else if (isRight) {
        ground[idx] = isWallArea ? RIGHT_T : RIGHT_B;
        collision[idx] = 1;
      }
      // Interior
      else if (isWallArea) {
        ground[idx] = FILL;
        collision[idx] = 1; // Wall area is not walkable
      } else {
        ground[idx] = FLOOR;
        collision[idx] = 0; // Floor is walkable
      }
    }
  }

  return { ground, collision, abovePlayer };
}

/**
 * Build a complete GameMap JSON from a theme.
 */
export function generateRoom(
  theme: RoomTheme,
  name: string,
  width: number,
  height: number,
): Record<string, unknown> {
  const tiles = generateRoomTiles(theme, width, height);

  // Tile properties for the new tileset
  // Border/wall tiles are not walkable, floor tiles are
  const tileProperties: Record<string, { walkable: boolean; type: string }> = {};

  // Mark all used GIDs
  const usedGids = new Set(tiles.ground);
  for (const g of usedGids) {
    if (g === 0) continue;
    const isFloor = tiles.ground.some((grd, i) => grd === g && tiles.collision[i] === 0);
    const isWall = tiles.ground.some((grd, i) => grd === g && tiles.collision[i] === 1);
    if (isFloor && !isWall) {
      tileProperties[String(g)] = { walkable: true, type: "floor" };
    } else if (isWall && !isFloor) {
      tileProperties[String(g)] = { walkable: false, type: "wall" };
    } else {
      // Mixed usage (e.g., door tile used in both walkable and non-walkable contexts)
      tileProperties[String(g)] = { walkable: true, type: "door" };
    }
  }

  // Spawn points near the door (bottom center)
  const doorX = Math.floor(width / 2);
  const spawnY = height - 2;
  const objects = [
    { type: "spawn", x: doorX - 1, y: spawnY },
    { type: "spawn", x: doorX, y: spawnY },
    { type: "spawn", x: doorX - 1, y: spawnY - 1 },
    { type: "spawn", x: doorX, y: spawnY - 1 },
  ];

  return {
    name,
    width,
    height,
    tileSize: 32,
    tileset: "/cozy/tileset-interior.png",
    tilesetColumns: COLS,
    tilesetTileSize: 16,
    tileProperties,
    layers: tiles,
    furniture: [],
    objects,
  };
}

// Export for use in editor
export { BORDER_COLORS, FLOOR_STYLES, WALL_PATTERNS };
