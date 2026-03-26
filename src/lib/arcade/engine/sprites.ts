// pixel-agents spritesheet format:
// Each character PNG is 112x96 (7 cols x 3 rows)
// Rows: 0=down, 1=up, 2=right (left = flip right horizontally)
// Cols: 0=walk1, 1=idle, 2=walk2, 3=type1, 4=type2, 5=read1, 6=read2
// Cell size: 16w x 32h
//
// We load all 6 character PNGs as separate images.

const SPRITE_W = 16;
const SPRITE_H = 32;
const SHEET_COLS = 7;

// Row index in each character spritesheet
const DIR_ROW: Record<string, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2, // same as right, drawn flipped
};

// Column indices
const COL_IDLE = 1;
const COL_WALK1 = 0;
const COL_WALK2 = 2;

const characters: HTMLImageElement[] = [];
let loaded = false;
let walkFrame = 0;
let walkTimer = 0;
const WALK_FRAME_DURATION = 0.2; // toggle walk frame every 200ms

export function loadSpritesheet(basePath: string): Promise<void> {
  if (loaded) return Promise.resolve();

  // Load char_0.png through char_5.png
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 6; i++) {
    promises.push(
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          characters[i] = img;
          resolve();
        };
        img.onerror = reject;
        img.src = `${basePath}/char_${i}.png`;
      }),
    );
  }

  return Promise.all(promises).then(() => {
    loaded = true;
  });
}

export function isSpriteLoaded(): boolean {
  return loaded;
}

export function resetSprites(): void {
  characters.length = 0;
  loaded = false;
  walkFrame = 0;
  walkTimer = 0;
}

/** Call from update(dt) to animate walk cycle */
export function updateSpriteAnimation(dt: number): void {
  walkTimer += dt;
  if (walkTimer >= WALK_FRAME_DURATION) {
    walkTimer -= WALK_FRAME_DURATION;
    walkFrame = walkFrame === 0 ? 1 : 0;
  }
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  spriteId: number,
  dir: "up" | "down" | "left" | "right",
  walking: boolean,
  dx: number,
  dy: number,
  scale: number = 2,
): void {
  const charImg = characters[spriteId % characters.length];
  if (!charImg) return;

  const row = DIR_ROW[dir];
  const col = walking ? (walkFrame === 0 ? COL_WALK1 : COL_WALK2) : COL_IDLE;

  const sx = col * SPRITE_W;
  const sy = row * SPRITE_H;
  const dw = SPRITE_W * scale;
  const dh = SPRITE_H * scale;

  // Left = flip right horizontally
  if (dir === "left") {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(charImg, sx, sy, SPRITE_W, SPRITE_H, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(charImg, sx, sy, SPRITE_W, SPRITE_H, dx, dy, dw, dh);
  }
}
