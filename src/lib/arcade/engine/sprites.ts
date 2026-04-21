// ─── Cozy People spritesheet format (greyscale + tinting) ───
// Walk sheets: 256x128 (8 cols × 4 rows of 32×32)
// Rows: 0=down, 1=up, 2=left, 3=right
// Cols: 0-7 = 8-frame walk cycle (frame 0 = idle)
//
// Layers composited bottom-up: body → eyes → clothes → hair → acc
// Each layer is a greyscale PNG tinted at runtime via Canvas multiply blend.
//
// ─── Legacy pixel-agents format (kept as fallback) ──────────
// Each character PNG is 112x96 (7 cols x 3 rows)
// Rows: 0=down, 1=up, 2=right (left = flip right horizontally)
// Cols: 0=walk1, 1=idle, 2=walk2
// Cell size: 16w x 32h

// ─── Constants ──────────────────────────────────────────────
const COZY_CELL = 32;
const COZY_COLS = 8;
const COZY_DIR_ROW: Record<string, number> = { down: 0, up: 1, left: 3, right: 2 };

const LEGACY_SPRITE_W = 16;
const LEGACY_SPRITE_H = 32;
const LEGACY_DIR_ROW: Record<string, number> = { down: 0, up: 1, right: 2, left: 2 };
const LEGACY_COL_IDLE = 1;
const LEGACY_COL_WALK1 = 0;
const LEGACY_COL_WALK2 = 2;

import type { AvatarLoadout } from "../types";

// ─── Cozy layer system ─────────────────────────────────────
export interface CozyLayer {
  id: string;
  file: string;        // path relative to cozy base
  color: string;       // hex color for tinting
  noTint?: boolean;
}

export interface CozyAvatar {
  layers: CozyLayer[];
}

// Shop item file lookup (loaded from DB, cached here)
const shopItemFiles = new Map<string, { file: string | null; no_tint: boolean; default_color: string | null }>();

export function registerShopItems(items: Array<{ id: string; file: string | null; no_tint: boolean; default_color: string | null }>): void {
  for (const item of items) {
    shopItemFiles.set(item.id, { file: item.file, no_tint: item.no_tint, default_color: item.default_color });
  }
}

/** Convert a DB loadout to a CozyAvatar (ordered layers for rendering) */
export function loadoutToAvatar(loadout: AvatarLoadout): CozyAvatar {
  const layers: CozyLayer[] = [];

  function addLayer(id: string, itemId: string | null, color: string | null) {
    if (!itemId) return;
    const info = shopItemFiles.get(itemId);
    if (!info?.file) return;
    const c = color ?? info.default_color ?? "#888888";
    layers.push({ id, file: info.file, color: c, noTint: info.no_tint });
  }

  // Body (always present)
  layers.push({ id: "body", file: "body/body_grey.png", color: loadout.skin_color || "#e8c4a0" });

  // Eyes
  layers.push({ id: "eyes", file: "eyes/eyes_grey.png", color: loadout.eyes_color || "#4a3728" });

  // Blush / Lipstick
  addLayer("blush", loadout.blush_id, loadout.blush_color);
  addLayer("lipstick", loadout.lipstick_id, loadout.lipstick_color);

  // Clothes: bottom → shoes → top OR full
  if (loadout.clothes_full_id) {
    addLayer("clothes_full", loadout.clothes_full_id, loadout.clothes_full_color);
  } else {
    addLayer("clothes_bottom", loadout.clothes_bottom_id, loadout.clothes_bottom_color);
    addLayer("shoes", loadout.shoes_id, loadout.shoes_color);
    addLayer("clothes_top", loadout.clothes_top_id, loadout.clothes_top_color);
  }

  // Hair
  addLayer("hair", loadout.hair_id, loadout.hair_color);

  // Accessories (order: facial → jewelry → face/mask → hat)
  addLayer("acc_facial", loadout.acc_facial_id, loadout.acc_facial_color);
  addLayer("acc_jewelry", loadout.acc_jewelry_id, loadout.acc_jewelry_color);
  addLayer("acc_face", loadout.acc_face_id, loadout.acc_face_color);
  addLayer("acc_hat", loadout.acc_hat_id, loadout.acc_hat_color);

  return { layers };
}

// Default loadout for players without one
const DEFAULT_LOADOUT: AvatarLoadout = {
  skin_color: "#e8c4a0",
  hair_id: "buzzcut", hair_color: "#1a1a1a",
  clothes_top_id: "basic", clothes_top_color: "#4a9eff",
  clothes_bottom_id: "pants", clothes_bottom_color: "#2c3e50",
  clothes_full_id: null, clothes_full_color: null,
  shoes_id: "shoes", shoes_color: "#4a3728",
  acc_hat_id: null, acc_hat_color: null,
  acc_face_id: null, acc_face_color: null,
  acc_facial_id: null, acc_facial_color: null,
  acc_jewelry_id: null, acc_jewelry_color: null,
  eyes_color: "#4a3728",
  blush_id: null, blush_color: null,
  lipstick_id: null, lipstick_color: null,
  pet_id: null,
};

export function getDefaultLoadout(): AvatarLoadout {
  return { ...DEFAULT_LOADOUT };
}

// Tinted layer cache: key = "file|color" → OffscreenCanvas
const tintCache = new Map<string, OffscreenCanvas>();
// Raw greyscale images: key = file → HTMLImageElement
const greyImages = new Map<string, HTMLImageElement>();

let cozyBasePath = "";
let cozyLoaded = false;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed: " + src));
    img.src = src;
  });
}

function tintSheet(img: HTMLImageElement, hexColor: string): OffscreenCanvas {
  const w = img.width, h = img.height;
  const oc = new OffscreenCanvas(w, h);
  const ctx = oc.getContext("2d")!;

  // 1. Draw greyscale
  ctx.drawImage(img, 0, 0);
  // 2. Multiply with color
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, w, h);
  // 3. Restore original alpha
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);

  return oc;
}

function getTintedSheet(file: string, color: string): OffscreenCanvas | null {
  const key = `${file}|${color}`;
  let cached = tintCache.get(key);
  if (cached) return cached;

  const img = greyImages.get(file);
  if (!img) return null;

  cached = tintSheet(img, color);
  tintCache.set(key, cached);
  return cached;
}

/** Load core greyscale PNGs (body, eyes). Additional files loaded on demand. */
export async function loadCozySprites(basePath: string): Promise<void> {
  cozyBasePath = basePath;

  // Always preload body + eyes (every player needs these)
  const coreFiles = ["body/body_grey.png", "eyes/eyes_grey.png"];
  const images = await Promise.all(
    coreFiles.map((f) => loadImage(`${basePath}/${f}`).catch(() => null)),
  );

  for (let i = 0; i < coreFiles.length; i++) {
    if (images[i]) greyImages.set(coreFiles[i], images[i]!);
  }

  cozyLoaded = greyImages.size > 0;
}

/** Load a specific sprite file if not already loaded */
export async function ensureSpriteLoaded(file: string): Promise<void> {
  if (greyImages.has(file)) return;
  if (!cozyBasePath) return;
  try {
    const img = await loadImage(`${cozyBasePath}/${file}`);
    greyImages.set(file, img);
  } catch {
    // silent — sprite won't render but game continues
  }
}

/** Preload all files needed by a loadout */
export async function preloadLoadout(loadout: AvatarLoadout): Promise<void> {
  const avatar = loadoutToAvatar(loadout);
  const missing = avatar.layers.filter((l) => !greyImages.has(l.file)).map((l) => l.file);
  if (missing.length === 0) return;
  await Promise.all(missing.map((f) => ensureSpriteLoaded(f)));
}

export function isCozyLoaded(): boolean {
  return cozyLoaded;
}

// ─── Legacy sprite system ──────────────────────────────────
const legacyChars: HTMLImageElement[] = [];
let legacyLoaded = false;

export function loadSpritesheet(basePath: string): Promise<void> {
  if (legacyLoaded) return Promise.resolve();

  const promises: Promise<void>[] = [];
  for (let i = 0; i < 6; i++) {
    promises.push(
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { legacyChars[i] = img; resolve(); };
        img.onerror = reject;
        img.src = `${basePath}/char_${i}.png`;
      }),
    );
  }

  return Promise.all(promises).then(() => { legacyLoaded = true; });
}

export function isSpriteLoaded(): boolean {
  return cozyLoaded || legacyLoaded;
}

// ─── Walk animation ────────────────────────────────────────
// Frame 0 is the idle pose; frames 1-7 are the walk cycle.
// We cycle walkFrame through 0..WALK_CYCLE_LEN-1 and map to frames 1..WALK_CYCLE_LEN when drawing.
const WALK_CYCLE_LEN = COZY_COLS - 1;
let walkFrame = 0;
let walkTimer = 0;
const WALK_FRAME_DURATION = 0.1;

export function updateSpriteAnimation(dt: number): void {
  walkTimer += dt;
  if (walkTimer >= WALK_FRAME_DURATION) {
    walkTimer -= WALK_FRAME_DURATION;
    walkFrame = (walkFrame + 1) % WALK_CYCLE_LEN;
  }
}

export function resetSprites(): void {
  legacyChars.length = 0;
  legacyLoaded = false;
  cozyLoaded = false;
  greyImages.clear();
  tintCache.clear();
  walkFrame = 0;
  walkTimer = 0;
}

// ─── Drawing ───────────────────────────────────────────────

/** Draw a cozy character (layered + tinted) */
export function drawCozyCharacter(
  ctx: CanvasRenderingContext2D,
  avatar: CozyAvatar,
  dir: "up" | "down" | "left" | "right",
  walking: boolean,
  dx: number,
  dy: number,
  scale: number = 2,
): void {
  const row = COZY_DIR_ROW[dir];
  const frame = walking ? walkFrame + 1 : 0;
  const dw = COZY_CELL * scale;
  const dh = COZY_CELL * scale;
  const sx = frame * COZY_CELL;
  const sy = row * COZY_CELL;

  for (const layer of avatar.layers) {
    if (layer.noTint) {
      // Pre-colored sprite — draw directly
      const img = greyImages.get(layer.file);
      if (!img) continue;
      ctx.drawImage(img, sx, sy, COZY_CELL, COZY_CELL, dx, dy, dw, dh);
    } else {
      const sheet = getTintedSheet(layer.file, layer.color);
      if (!sheet) continue;
      ctx.drawImage(sheet, sx, sy, COZY_CELL, COZY_CELL, dx, dy, dw, dh);
    }
  }
}

// Avatar cache per player: id → CozyAvatar (rebuilt when loadout changes)
const playerAvatarCache = new Map<string, CozyAvatar>();

/** Set/update a player's avatar from their loadout */
export function setPlayerAvatar(playerId: string, loadout: AvatarLoadout): void {
  playerAvatarCache.set(playerId, loadoutToAvatar(loadout));
}

/** Get a player's cached avatar, or a default */
export function getPlayerAvatar(playerId: string): CozyAvatar | null {
  return playerAvatarCache.get(playerId) ?? null;
}

/** Draw a character — uses player avatar cache, falls back to legacy */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  playerId: string,
  spriteId: number,
  dir: "up" | "down" | "left" | "right",
  walking: boolean,
  dx: number,
  dy: number,
  scale: number = 2,
): void {
  // Try cozy avatar from cache
  if (cozyLoaded) {
    const avatar = playerAvatarCache.get(playerId);
    if (avatar) {
      drawCozyCharacter(ctx, avatar, dir, walking, dx, dy, scale);
      return;
    }
    // No cached avatar — build from default loadout
    const defaultAvatar = loadoutToAvatar(getDefaultLoadout());
    drawCozyCharacter(ctx, defaultAvatar, dir, walking, dx, dy, scale);
    return;
  }

  // Fallback to legacy
  const charImg = legacyChars[spriteId % legacyChars.length];
  if (!charImg) return;

  const row = LEGACY_DIR_ROW[dir];
  const legacyWalk = walkFrame % 2;
  const col = walking ? (legacyWalk === 0 ? LEGACY_COL_WALK1 : LEGACY_COL_WALK2) : LEGACY_COL_IDLE;

  const sx = col * LEGACY_SPRITE_W;
  const sy = row * LEGACY_SPRITE_H;
  const dw = LEGACY_SPRITE_W * scale;
  const dh = LEGACY_SPRITE_H * scale;

  if (dir === "left") {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(charImg, sx, sy, LEGACY_SPRITE_W, LEGACY_SPRITE_H, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(charImg, sx, sy, LEGACY_SPRITE_W, LEGACY_SPRITE_H, dx, dy, dw, dh);
  }
}

// ─── Pet system ────────────────────────────────────────────
// Both cat and yorkie: cell 18x18, 4 walk cols
// Rows: 0=down, 1=up, 2=right, 3=left (swapped in DIR_ROW)
// Yorkie has extra rows: 4=sit, 5=eat/drink, 6=sleep
export interface PetDef {
  id: string;
  name: string;
  file: string;
  cell: number;
  cols: number;
}

export const PET_DEFS: PetDef[] = [
  { id: "cat", name: "Cat", file: "cat_animation.png", cell: 18, cols: 4 },
  { id: "yorkie", name: "Yorkie", file: "yorkie_animation.png", cell: 18, cols: 4 },
];

const PET_DIR_ROW: Record<string, number> = { down: 0, up: 1, left: 3, right: 2 };
const PET_WALK_FRAME_DURATION = 0.15;

const petImages = new Map<string, HTMLImageElement>();
let activePetId = "cat";
let petLoaded = false;
let petWalkFrame = 0;
let petWalkTimer = 0;

export function loadPetSprites(basePath: string): Promise<void> {
  const promises = PET_DEFS.map((def) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { petImages.set(def.id, img); resolve(); };
      img.onerror = () => { resolve(); };
      img.src = `${basePath}/${def.file}`;
    }),
  );
  return Promise.all(promises).then(() => {
    petLoaded = petImages.size > 0;
  });
}

// Keep old single-file loader for backwards compat
export function loadPetSprite(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { petImages.set("cat", img); petLoaded = true; resolve(); };
    img.onerror = () => { resolve(); };
    img.src = src;
  });
}

export function isPetLoaded(): boolean { return petLoaded; }

export function setActivePet(id: string): void { activePetId = id; }
export function getActivePet(): string { return activePetId; }
export function getPetDefs(): PetDef[] { return PET_DEFS; }

export function updatePetAnimation(dt: number, walking: boolean): void {
  const def = PET_DEFS.find((d) => d.id === activePetId) ?? PET_DEFS[0];
  if (walking) {
    petWalkTimer += dt;
    if (petWalkTimer >= PET_WALK_FRAME_DURATION) {
      petWalkTimer -= PET_WALK_FRAME_DURATION;
      petWalkFrame = (petWalkFrame + 1) % def.cols;
    }
  } else {
    petWalkFrame = 0;
    petWalkTimer = 0;
  }
}

export function drawPet(
  ctx: CanvasRenderingContext2D,
  dir: "up" | "down" | "left" | "right",
  walking: boolean,
  dx: number,
  dy: number,
  scale: number = 1,
): void {
  const def = PET_DEFS.find((d) => d.id === activePetId) ?? PET_DEFS[0];
  const img = petImages.get(activePetId);
  if (!img) return;
  const row = PET_DIR_ROW[dir];
  const frame = walking ? petWalkFrame : 0;
  const cell = def.cell;
  ctx.drawImage(img, frame * cell, row * cell, cell, cell,
    dx, dy, cell * scale, cell * scale);
}

export const PET_SIZE = 18; // both cat and yorkie are 18x18

export function resetPet(): void {
  petImages.clear();
  petLoaded = false;
  petWalkFrame = 0;
  petWalkTimer = 0;
}

/** Exported constants for renderer positioning */
export const COZY_SPRITE_SIZE = COZY_CELL;
export const SPRITE_W = LEGACY_SPRITE_W;
export const SPRITE_H = LEGACY_SPRITE_H;
