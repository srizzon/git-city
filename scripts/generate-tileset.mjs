/**
 * Builds tileset PNG for E.Arcade lobby with Lumon palette.
 * Tiles: floor variants, walls, door, tile floor.
 *
 * Run: node scripts/generate-tileset.mjs
 * Output: public/sprites/arcade-tileset.png
 */
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CELL = 32;
const COLS = 16;

const P = {
  wallLight: "#e8e4df",
  wallLine: "#c0bbb5",
  wallBase: "#b8b3ad",
  wallMid: "#d4d0cb",
  carpetA: "#c8bfb0", carpetAMid: "#beb5a6", carpetADark: "#b4ab9c",
  carpetB: "#c0c0b0", carpetBMid: "#b6b6a6", carpetBDark: "#acac9c",
  rugLight: "#c4b8a8", rugMid: "#baae9e", rugDark: "#b0a494",
  tileMid: "#d0d0d0", tileGap: "#b8b8b8",
  doorFrame: "#909090",
};

function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

function drawCarpetTile(ctx, ox, oy, light, mid, dark) {
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const v = ((x + y) % 4 === 0) ? 1 : ((x * y) % 7 === 0) ? 2 : 0;
      px(ctx, ox + x, oy + y, v === 1 ? light : v === 2 ? dark : mid);
    }
}

const tiles = [];
let nextId = 0;

function addTile(name, drawer) {
  tiles.push({ id: nextId++, name, drawer });
}

// 0: empty
addTile("empty", () => {});

// 1: carpet A (reception/default)
addTile("carpet_a", (ctx) => drawCarpetTile(ctx, 0, 0, P.carpetA, P.carpetAMid, P.carpetADark));

// 2: carpet B (work zone)
addTile("carpet_b", (ctx) => drawCarpetTile(ctx, 0, 0, P.carpetB, P.carpetBMid, P.carpetBDark));

// 3: rug (social nook)
addTile("rug", (ctx) => drawCarpetTile(ctx, 0, 0, P.rugLight, P.rugMid, P.rugDark));

// 4: wall horizontal
addTile("wall_h", (ctx) => {
  rect(ctx, 0, 0, CELL, 24, P.wallLight);
  rect(ctx, 0, 24, CELL, 2, P.wallLine);
  rect(ctx, 0, 26, CELL, 6, P.wallBase);
});

// 5: wall left
addTile("wall_l", (ctx) => {
  rect(ctx, 0, 0, CELL, CELL, P.wallMid);
  rect(ctx, CELL - 4, 0, 2, CELL, P.wallLine);
  rect(ctx, CELL - 2, 0, 2, CELL, P.wallBase);
});

// 6: wall right
addTile("wall_r", (ctx) => {
  rect(ctx, 0, 0, CELL, CELL, P.wallMid);
  rect(ctx, 0, 0, 2, CELL, P.wallBase);
  rect(ctx, 2, 0, 2, CELL, P.wallLine);
});

// 7: door
addTile("door", (ctx) => {
  drawCarpetTile(ctx, 0, 0, P.carpetA, P.carpetAMid, P.carpetADark);
  rect(ctx, 0, 0, CELL, 2, P.doorFrame);
});

// 8: tile floor (corridor near elevator)
addTile("tile_floor", (ctx) => {
  rect(ctx, 0, 0, CELL, CELL, P.tileMid);
  rect(ctx, CELL - 2, 0, 2, CELL, P.tileGap);
  rect(ctx, 0, CELL - 2, CELL, 2, P.tileGap);
  rect(ctx, 0, 0, CELL, 2, "#d8d8d8");
  rect(ctx, 0, 0, 2, CELL, "#d8d8d8");
});

// 9: half wall (internal divider)
addTile("half_wall", (ctx) => {
  drawCarpetTile(ctx, 0, 0, P.carpetA, P.carpetAMid, P.carpetADark);
  rect(ctx, 0, 0, CELL, 16, P.wallLight);
  rect(ctx, 0, 14, CELL, 2, P.wallLine);
  rect(ctx, 0, 16, CELL, 2, P.wallBase);
});

// ── Render tileset ──
const rows = Math.ceil(tiles.length / COLS);
const canvas = createCanvas(COLS * CELL, rows * CELL);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

for (const tile of tiles) {
  const col = tile.id % COLS;
  const row = Math.floor(tile.id / COLS);
  ctx.save();
  ctx.translate(col * CELL, row * CELL);
  tile.drawer(ctx);
  ctx.restore();
}

const outPath = join(__dirname, "..", "public", "sprites", "arcade-tileset.png");
writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`Tileset: ${COLS * CELL}x${rows * CELL}px, ${tiles.length} tiles`);
console.log(`Saved: ${outPath}`);
for (const t of tiles) console.log(`  ${t.id}: ${t.name}`);
