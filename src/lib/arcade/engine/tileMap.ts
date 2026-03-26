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

/** Find a seat (or PC workstation) at or near the player */
export function findNearbySeat(
  playerX: number,
  playerY: number,
): MapObject | null {
  // Both "seat" and "pc" are sittable
  return findNearbyObject(playerX, playerY, "seat")
    ?? findNearbyObject(playerX, playerY, "pc");
}

export interface GameMap {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tileset: string;
  tilesetColumns: number;
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
  currentMap = map;
  return map;
}

export function getMap(): GameMap | null {
  return currentMap;
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
