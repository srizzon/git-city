import type { PlayerState, ChatBubble } from "../types";
import type { GameMap, FurnitureObject } from "./tileMap";
import { drawCharacter, isSpriteLoaded } from "./sprites";

export interface RenderPlayer extends PlayerState {
  renderX: number;
  renderY: number;
  walking: boolean;
}

// ─── Tileset ──────────────────────────────────────────────────
let tilesetImg: HTMLImageElement | null = null;
let tilesetCols = 16;

export function loadTileset(src: string, columns: number): Promise<void> {
  tilesetCols = columns;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { tilesetImg = img; resolve(); };
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Furniture sprites ────────────────────────────────────────
const furnitureImages = new Map<string, HTMLImageElement>();

export function loadFurnitureSprites(basePath: string, spriteKeys: string[]): Promise<void> {
  const unique = [...new Set(spriteKeys)];
  const promises = unique.map((key) => {
    // Map sprite keys to file paths
    const path = getSpriteFile(basePath, key);
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { furnitureImages.set(key, img); resolve(); };
      img.onerror = () => { console.warn(`[arcade] Failed to load furniture sprite: ${path}`); resolve(); };
      img.src = path;
    });
  });
  return Promise.all(promises).then(() => {});
}

function getSpriteFile(basePath: string, key: string): string {
  // Map keys like "DESK_FRONT" -> "/sprites/arcade/furniture-lumon/DESK/DESK_FRONT.png"
  const parts = key.split("_");
  const nameMap: Record<string, string> = {
    DESK_FRONT: "DESK/DESK_FRONT",
    DESK_SIDE: "DESK/DESK_SIDE",
    PC_FRONT: "PC/PC_FRONT_ON_1",
    CHAIR_FRONT: "CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT",
    CHAIR_BACK: "CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK",
    PLANT: "PLANT/PLANT",
    CACTUS: "CACTUS/CACTUS",
    BOOKSHELF: "BOOKSHELF/BOOKSHELF",
    WHITEBOARD: "WHITEBOARD/WHITEBOARD",
    SOFA_FRONT: "SOFA/SOFA_FRONT",
    SMALL_TABLE: "SMALL_TABLE/SMALL_TABLE_FRONT",
    CLOCK: "CLOCK/CLOCK",
    BIN: "BIN/BIN",
    COFFEE: "COFFEE/COFFEE",
    LARGE_PAINTING: "LARGE_PAINTING/LARGE_PAINTING",
    SMALL_PAINTING: "SMALL_PAINTING/SMALL_PAINTING",
  };
  const mapped = nameMap[key];
  if (mapped) return `${basePath}/furniture-lumon/${mapped}.png`;
  return `${basePath}/furniture-lumon/${parts[0]}/${key}.png`;
}

// ─── Pre-rendered ground cache ────────────────────────────────
let groundCache: HTMLCanvasElement | null = null;

// ─── Camera ──────────────────────────────────────────────────
let cameraX = 0;
let cameraY = 0;
let viewportW = 0;
let viewportH = 0;

export function updateCamera(targetX: number, targetY: number, dt: number, map: GameMap): void {
  const mapW = map.width * map.tileSize;
  const mapH = map.height * map.tileSize;

  let idealX = targetX - viewportW / 2;
  let idealY = targetY - viewportH / 2;

  if (viewportW < mapW) {
    idealX = Math.max(0, Math.min(idealX, mapW - viewportW));
  } else {
    idealX = -(viewportW - mapW) / 2;
  }
  if (viewportH < mapH) {
    idealY = Math.max(0, Math.min(idealY, mapH - viewportH));
  } else {
    idealY = -(viewportH - mapH) / 2;
  }

  const speed = 8;
  cameraX += (idealX - cameraX) * Math.min(1, speed * dt);
  cameraY += (idealY - cameraY) * Math.min(1, speed * dt);
}

export function snapCamera(targetX: number, targetY: number, map: GameMap): void {
  const mapW = map.width * map.tileSize;
  const mapH = map.height * map.tileSize;

  if (viewportW < mapW) {
    cameraX = Math.max(0, Math.min(targetX - viewportW / 2, mapW - viewportW));
  } else {
    cameraX = -(viewportW - mapW) / 2;
  }
  if (viewportH < mapH) {
    cameraY = Math.max(0, Math.min(targetY - viewportH / 2, mapH - viewportH));
  } else {
    cameraY = -(viewportH - mapH) / 2;
  }
}

export function getCameraState(): { x: number; y: number; viewportW: number; viewportH: number } {
  return { x: cameraX, y: cameraY, viewportW, viewportH };
}

export function resetRenderer(): void {
  groundCache = null;
  cameraX = 0;
  cameraY = 0;
  viewportW = 0;
  viewportH = 0;
  tilesetImg = null;
  furnitureImages.clear();
}

export function buildLayerCaches(map: GameMap): void {
  const ts = map.tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = map.width * ts;
  canvas.height = map.height * ts;
  const ctx = canvas.getContext("2d");
  if (!ctx) { groundCache = canvas; return; }
  ctx.imageSmoothingEnabled = false;

  if (!tilesetImg) { groundCache = canvas; return; }

  for (let i = 0; i < map.layers.ground.length; i++) {
    const gid = map.layers.ground[i];
    if (gid === 0) continue;

    const sx = (gid % tilesetCols) * ts;
    const sy = Math.floor(gid / tilesetCols) * ts;
    const dx = (i % map.width) * ts;
    const dy = Math.floor(i / map.width) * ts;

    ctx.drawImage(tilesetImg, sx, sy, ts, ts, dx, dy, ts, ts);
  }

  groundCache = canvas;
}

// ─── Canvas sizing ────────────────────────────────────────────
export function resizeCanvas(canvas: HTMLCanvasElement, map: GameMap, isMobile: boolean): number {
  const mapW = map.width * map.tileSize;
  const mapH = map.height * map.tileSize;

  // Available CSS pixels — fullscreen for both mobile and desktop
  const availW = isMobile ? window.innerWidth : window.innerWidth - 96;
  const availH = isMobile ? window.innerHeight : window.innerHeight - 104;

  // Fill the available area: scale so canvas covers everything
  const fillScale = Math.max(availW / mapW, availH / mapH);
  viewportW = Math.min(mapW, Math.round(availW / fillScale));
  viewportH = Math.min(mapH, Math.round(availH / fillScale));

  canvas.width = viewportW;
  canvas.height = viewportH;
  canvas.style.width = `${availW}px`;
  canvas.style.height = `${availH}px`;

  return fillScale;
}

// ─── Main render ──────────────────────────────────────────────
export interface InteractionPrompt {
  x: number; // tile x
  y: number; // tile y
  text: string; // "Press E"
}

export function render(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  players: RenderPlayer[],
  bubbles: ChatBubble[],
  localPlayerId: string,
  prompt?: InteractionPrompt | null,
  gameMessage?: string | null,
): void {
  const ts = map.tileSize;

  ctx.clearRect(0, 0, viewportW, viewportH);
  ctx.save();
  ctx.translate(Math.round(-cameraX), Math.round(-cameraY));

  // Layer 1: Ground tiles
  if (groundCache) {
    ctx.drawImage(groundCache, 0, 0);
  }

  // Layer 2+3: Furniture + Players, Z-sorted by sortY
  interface Renderable {
    sortY: number;
    draw: () => void;
  }

  const renderables: Renderable[] = [];

  for (const f of map.furniture) {
    const sortY = (f as FurnitureObject & { sortY?: number }).sortY ?? (f.y + f.height);
    renderables.push({
      sortY,
      draw: () => {
        const img = furnitureImages.get(f.sprite);
        if (img) {
          ctx.drawImage(img, f.x, f.y, img.width * 2, img.height * 2);
        } else {
          drawFurnitureFallback(ctx, f);
        }
      },
    });
  }

  for (const p of players) {
    renderables.push({
      sortY: p.renderY + ts,
      draw: () => renderPlayer(ctx, p, ts, localPlayerId),
    });
  }

  renderables.sort((a, b) => a.sortY - b.sortY);
  for (const r of renderables) r.draw();

  // Layer 4: Speech bubbles
  renderBubbles(ctx, players, bubbles, ts);

  // Layer 5: Interaction prompt (floating near the player)
  if (prompt) {
    const localP = players.find((p) => p.id === localPlayerId);
    if (localP) {
      const px = localP.renderX + ts / 2;

      ctx.font = "bold 10px monospace";
      const label = `[E] ${prompt.text}`;
      const textW = ctx.measureText(label).width;
      const padX = 8;
      const bw = textW + padX * 2;
      const bh = 18;

      // Show above player, but below if too close to top edge
      const aboveY = localP.renderY - 40;
      const belowY = localP.renderY + ts + 20;
      const py = aboveY - bh >= 0 ? aboveY : belowY;

      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      roundRect(ctx, px - bw / 2, py - bh, bw, bh, 5);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(label, px, py - 5);
    }
  }

  // Layer 6: Game message (above player, same position as prompt)
  if (gameMessage) {
    const localP = players.find((p) => p.id === localPlayerId);
    if (localP) {
      const cx = localP.renderX + ts / 2;

      ctx.font = "bold 10px monospace";
      const textW = ctx.measureText(gameMessage).width;
      const padX = 10;
      const bw = textW + padX * 2;
      const bh = 18;

      const aboveY = localP.renderY - 40;
      const belowY = localP.renderY + ts + 20;
      const py = aboveY - bh >= 0 ? aboveY : belowY;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      roundRect(ctx, cx - bw / 2, py - bh, bw, bh, 5);
      ctx.fill();

      ctx.fillStyle = "#e8e4df";
      ctx.textAlign = "center";
      ctx.fillText(gameMessage, cx, py - 5);
    }
  }

  ctx.restore();
}

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  p: RenderPlayer,
  ts: number,
  localPlayerId: string,
): void {
  const px = p.renderX;
  const py = p.renderY;

  if (isSpriteLoaded()) {
    const spriteScale = 2;
    const spriteW = 16 * spriteScale;
    const spriteH = 32 * spriteScale;
    drawCharacter(
      ctx, p.sprite_id, p.dir, p.walking,
      px + (ts - spriteW) / 2,
      py - spriteH + ts,
      spriteScale,
    );
  } else {
    const isLocal = p.id === localPlayerId;
    ctx.fillStyle = isLocal ? "#c8e64a" : "#4a9eff";
    ctx.fillRect(px + 8, py + 4, 16, 24);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(p.github_login, px + ts / 2, py + ts + 10);
}

function drawFurnitureFallback(ctx: CanvasRenderingContext2D, f: FurnitureObject): void {
  // Simple colored rectangle as fallback
  if (f.sprite.includes("ARCADE")) {
    ctx.fillStyle = "#4040a0";
  } else if (f.sprite.includes("ELEV")) {
    ctx.fillStyle = "#505060";
  } else {
    ctx.fillStyle = "#6a5a3a";
  }
  ctx.fillRect(f.x + 2, f.y + 2, f.width - 4, f.height - 4);
}

function renderBubbles(
  ctx: CanvasRenderingContext2D,
  players: RenderPlayer[],
  bubbles: ChatBubble[],
  ts: number,
): void {
  const bubblesByPlayer = new Map<string, ChatBubble[]>();
  for (const bubble of bubbles) {
    const list = bubblesByPlayer.get(bubble.id) ?? [];
    list.push(bubble);
    bubblesByPlayer.set(bubble.id, list);
  }

  const BUBBLE_H = 16;
  const BUBBLE_GAP = 2;

  for (const [playerId, playerBubbles] of bubblesByPlayer) {
    const player = players.find((p) => p.id === playerId);
    if (!player) continue;

    const bx = player.renderX + ts / 2;
    const baseY = player.renderY - 20;

    for (let i = 0; i < playerBubbles.length; i++) {
      const bubble = playerBubbles[i];
      const stackOffset = (playerBubbles.length - 1 - i) * (BUBBLE_H + BUBBLE_GAP);
      const by = baseY - stackOffset;

      const alpha = bubble.timer < 1 ? bubble.timer : 1;
      ctx.globalAlpha = alpha;

      ctx.font = "8px monospace";
      const textWidth = ctx.measureText(bubble.text).width;
      const padding = 6;
      const bw = textWidth + padding * 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      roundRect(ctx, bx - bw / 2, by - BUBBLE_H, bw, BUBBLE_H, 3);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(bubble.text, bx, by - 5);

      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
