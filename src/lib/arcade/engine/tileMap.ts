// ─── Map loader (tiles + objects hybrid) ──────────────────────
// Tile layers: floor, walls (grid-based)
// Object layer: furniture (full sprites at pixel positions)
// Collision: flat boolean grid computed from both

export interface FurnitureObject {
  id: string;
  sprite: string;
  x: number;      // pixel position (top-left of sprite)
  y: number;
  width: number;  // footprint pixel size
  height: number;
  collides: boolean;
  sortY?: number;  // Z-sort key (bottom of footprint). If missing, uses y + height.
  sittable?: boolean; // Gather-style: player walks through and auto-sits when idle
  sitDir?: "up" | "down" | "left" | "right"; // Direction player faces when sitting (for items without directional sprite names)
}

export interface MapObject {
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  dir?: "up" | "down" | "left" | "right"; // facing direction when sitting
}

/** Find an interactive object at or near the player */
export function findNearbyObject(
  playerX: number,
  playerY: number,
  type?: string,
): MapObject | null {
  if (!currentMap) return null;
  for (const obj of currentMap.objects) {
    if (type && obj.type !== type) continue;
    if (obj.type === "spawn") continue;
    // Use object width for range (elevator is 4 tiles wide)
    const objW = obj.width ?? 1;
    const objH = obj.height ?? 1;
    // Check if player is within 1 tile of any part of the object
    const nearX = playerX >= obj.x - 1 && playerX <= obj.x + objW;
    const nearY = playerY >= obj.y - 1 && playerY <= obj.y + objH;
    if (nearX && nearY) {
      return obj;
    }
  }
  return null;
}

/** Find a seat (or PC workstation / arcade machine) at or near the player */
export function findNearbySeat(
  playerX: number,
  playerY: number,
): MapObject | null {
  // "seat", "pc", and "arcade_machine" are all sittable
  const seat = findNearbyObject(playerX, playerY, "seat")
    ?? findNearbyObject(playerX, playerY, "pc")
    ?? findNearbyObject(playerX, playerY, "arcade_machine");

  // Debug: log seat finding
  if (seat) {
    console.log(`[seat] Player(${playerX},${playerY}) → found ${seat.type} at (${seat.x},${seat.y}) dir=${seat.dir}`);
  }
  return seat;
}

/** Per-tile-ID properties — defined once on the tileset, inherited by all instances */
export interface TileProperties {
  /** Map of ground tile ID → properties */
  [tileId: number]: {
    walkable: boolean;
    type: "wall" | "floor" | "door";
  };
}

export interface GameMap {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tileset: string;
  tilesetColumns: number;
  /** Tile size in the tileset image (px). If absent, uses tileSize. */
  tilesetTileSize?: number;
  /** Per-tile-ID properties. If absent, falls back to collision layer. */
  tileProperties?: TileProperties;
  layers: {
    ground: number[];
    collision: number[];
    abovePlayer: number[];
  };
  furniture: FurnitureObject[];
  objects: MapObject[];
}

let currentMap: GameMap | null = null;

export async function loadMap(url: string): Promise<GameMap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load map: ${url}`);
  const map: GameMap = await res.json();
  currentMap = map;
  return map;
}

export function loadMapFromData(map: GameMap): GameMap {
  // If tileProperties exist, rebuild collision from structural tiles + furniture
  if (map.tileProperties) {
    rebuildCollision(map);
  }
  currentMap = map;
  return map;
}

export function getMap(): GameMap | null {
  return currentMap;
}

/**
 * Check if a tile is structurally walkable (ignoring furniture).
 * Uses tileProperties if available, otherwise falls back to collision layer.
 */
export function isStructurallyWalkable(map: GameMap, x: number, y: number): boolean {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  if (map.tileProperties) {
    const gid = map.layers.ground[y * map.width + x];
    const props = map.tileProperties[gid];
    return props ? props.walkable : true; // unknown tiles default to walkable
  }
  // Fallback: use collision layer
  return map.layers.collision[y * map.width + x] === 0;
}

/**
 * Get the structural type of a tile ("wall", "floor", "door").
 * Returns "floor" if tileProperties is not defined.
 */
export function getTileType(map: GameMap, x: number, y: number): "wall" | "floor" | "door" {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return "wall";
  if (map.tileProperties) {
    const gid = map.layers.ground[y * map.width + x];
    const props = map.tileProperties[gid];
    return props?.type ?? "floor";
  }
  // Fallback: collision=1 means wall
  return map.layers.collision[y * map.width + x] !== 0 ? "wall" : "floor";
}

/**
 * Rebuild the collision layer from tileProperties + furniture footprints.
 * Call this after furniture changes to keep collision in sync.
 */
export function rebuildCollision(map: GameMap): void {
  const { width, height, tileSize } = map;
  const coll = new Array(width * height).fill(0);

  // 1. Static collision from tile properties
  for (let i = 0; i < coll.length; i++) {
    if (map.tileProperties) {
      const gid = map.layers.ground[i];
      const props = map.tileProperties[gid];
      if (props && !props.walkable) coll[i] = 1;
    }
  }

  // 2. Dynamic collision from furniture
  for (const f of map.furniture) {
    if (!f.collides) continue;
    // Sittable furniture is walk-through (Gather-style)
    if (f.sittable || f.sprite.includes("sofa_") || f.sprite.includes("chair_") || f.sprite.includes("puff_")) continue;
    const ftx = Math.floor(f.x / tileSize);
    const fty = Math.floor(f.y / tileSize);
    const ftw = Math.floor(f.width / tileSize);
    const fth = Math.floor(f.height / tileSize);
    for (let dy = 0; dy < fth; dy++) {
      for (let dx = 0; dx < ftw; dx++) {
        const idx = (fty + dy) * width + (ftx + dx);
        if (idx >= 0 && idx < coll.length) coll[idx] = 1;
      }
    }
  }

  map.layers.collision = coll;
}

export function isWalkable(x: number, y: number): boolean {
  if (!currentMap) return false;
  if (x < 0 || x >= currentMap.width || y < 0 || y >= currentMap.height) return false;
  return currentMap.layers.collision[y * currentMap.width + x] === 0;
}

export function getSpawns(): Array<{ x: number; y: number }> {
  if (!currentMap) return [{ x: 12, y: 15 }];
  return currentMap.objects
    .filter((o) => o.type === "spawn")
    .map((o) => ({ x: o.x, y: o.y }));
}

export function getRandomSpawn(): { x: number; y: number } {
  const spawns = getSpawns();
  return spawns[Math.floor(Math.random() * spawns.length)];
}

export function getCollisionData(): number[] {
  return currentMap?.layers.collision ?? [];
}

export function resetMap(): void {
  currentMap = null;
}
