"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { GameMap, FurnitureObject } from "@/lib/arcade/engine/tileMap";
import { getTileType, rebuildCollision } from "@/lib/arcade/engine/tileMap";
import { getCameraState, loadFurnitureSprites } from "@/lib/arcade/engine/renderer";

// ─── Sprite catalog ──────────────────────────────────────────
export type PlacementType = "floor" | "wall" | "rug";

/** What interactive object type this item generates when placed */
export type InteractType = "seat" | "pc" | "arcade_machine" | null;

export interface CatalogItem {
  id: string;
  label: string;
  category: string;
  /** File name in /cozy/furniture/ (without path) */
  file: string;
  /** Is it a GIF (animated)? */
  animated?: boolean;
  /** Pixel size of the source sprite */
  pw: number;
  ph: number;
  /** Footprint in tiles (width × height) at 2x render scale */
  tw: number;
  th: number;
  collides: boolean;
  /** Where this item can be placed */
  placement: PlacementType;
  /** Interactive object type (seat, pc, arcade_machine) */
  interact?: InteractType;
  /** Default facing direction for seats */
  seatDir?: "up" | "down" | "left" | "right";
}

// Helper to define items concisely
function item(id: string, label: string, category: string, file: string, pw: number, ph: number, tw: number, th: number, collides = true, animated = false, placement: PlacementType = "floor", interact?: InteractType, seatDir?: "up" | "down" | "left" | "right"): CatalogItem {
  return { id, label, category, file, pw, ph, tw, th, collides, animated, placement, interact: interact ?? null, seatDir };
}
function seatItem(id: string, label: string, category: string, file: string, pw: number, ph: number, tw: number, th: number): CatalogItem {
  return { id, label, category, file, pw, ph, tw, th, collides: false, placement: "floor", interact: "seat" };
}
function wallItem(id: string, label: string, category: string, file: string, pw: number, ph: number, tw: number, th: number): CatalogItem {
  return { id, label, category, file, pw, ph, tw, th, collides: false, placement: "wall" };
}
function rugItem(id: string, label: string, category: string, file: string, pw: number, ph: number, tw: number, th: number): CatalogItem {
  return { id, label, category, file, pw, ph, tw, th, collides: false, placement: "rug" };
}

const COZY_BASE = "/cozy/furniture";

const CATALOG: CatalogItem[] = [
  // ─── Arcade Machines ────────────────────────────────────────
  item("arcade_dance", "Dance Machine", "Arcade", "arcade_dance.gif", 32, 48, 2, 3, true, true, "floor", "arcade_machine"),
  item("arcade_duck", "Duck Hunt", "Arcade", "arcade_duck.gif", 16, 32, 1, 2, true, true, "floor", "arcade_machine"),
  item("arcade_fruit", "Fruit Slot", "Arcade", "arcade_fruit.gif", 16, 32, 1, 2, true, true, "floor", "arcade_machine"),
  item("arcade_race", "Racing", "Arcade", "arcade_race.gif", 16, 32, 1, 2, true, true, "floor", "arcade_machine"),
  item("arcade_rhythm", "Rhythm", "Arcade", "arcade_rhythm.gif", 16, 32, 1, 2, true, true, "floor", "arcade_machine"),
  item("arcade_shooter", "Shooter", "Arcade", "arcade_shooter.gif", 16, 32, 1, 2, true, true, "floor", "arcade_machine"),

  // ─── Sofas ──────────────────────────────────────────────────
  ...["cream", "terra", "olive", "teal"].flatMap((c) => [
    // Front/Back: wide (2-3 tiles) × shallow (2 tiles)
    seatItem(`sofa_2seat_${c}_front`, `2S ${c} Front`, "Sofas", `sofa_2seat_${c}_front.png`, 32, 32, 2, 2),
    seatItem(`sofa_2seat_${c}_back`, `2S ${c} Back`, "Sofas", `sofa_2seat_${c}_back.png`, 32, 32, 2, 2),
    // Left/Right: narrow (1 tile) × tall (2-3 tiles) — from original pack art
    seatItem(`sofa_2seat_${c}_left`, `2S ${c} Left`, "Sofas", `sofa_2seat_${c}_left.png`, 16, 32, 1, 2),
    seatItem(`sofa_2seat_${c}_right`, `2S ${c} Right`, "Sofas", `sofa_2seat_${c}_right.png`, 16, 32, 1, 2),
    seatItem(`sofa_3seat_${c}_left`, `3S ${c} Left`, "Sofas", `sofa_3seat_${c}_left.png`, 16, 48, 1, 3),
    seatItem(`sofa_3seat_${c}_right`, `3S ${c} Right`, "Sofas", `sofa_3seat_${c}_right.png`, 16, 48, 1, 3),
    // Single seat (armchair) in all 4 directions
    seatItem(`sofa_1seat_${c}_left`, `1S ${c} Left`, "Sofas", `sofa_1seat_${c}_left.png`, 16, 16, 1, 1),
    seatItem(`sofa_1seat_${c}_right`, `1S ${c} Right`, "Sofas", `sofa_1seat_${c}_right.png`, 16, 16, 1, 1),
  ]),

  // ─── Desks ──────────────────────────────────────────────────
  ...["birch", "oak", "walnut", "cherry", "dark", "gray", "black"].map((c) =>
    item(`desk_${c}`, `Desk ${c}`, "Desks", `desk_${c}.png`, 48, 32, 3, 2),
  ),
  item("table_medium_1", "Table Medium 1", "Desks", "table_medium_1.png", 48, 32, 3, 2),
  item("table_medium_2", "Table Medium 2", "Desks", "table_medium_2.png", 48, 32, 3, 2),
  item("table_small_1", "Table Small 1", "Desks", "table_small_1.png", 32, 32, 2, 2),
  item("table_small_2", "Table Small 2", "Desks", "table_small_2.png", 32, 32, 2, 2),
  item("table_round_1", "Round Table 1", "Desks", "table_round_1.png", 32, 32, 2, 2),
  item("table_round_2", "Round Table 2", "Desks", "table_round_2.png", 32, 32, 2, 2),
  item("table_long_1", "Long Table", "Desks", "table_long_1.png", 48, 32, 3, 2),

  // ─── Coffee Tables ─────────────────────────────────────────
  ...Array.from({ length: 5 }, (_, i) =>
    item(`pouf_${i + 1}`, `Pouf ${i + 1}`, "Coffee", `pouf_${i + 1}.png`, 16, 16, 1, 1),
  ),
  ...Array.from({ length: 4 }, (_, i) =>
    item(`coffeetable_wood_${i + 1}`, `Wood Table ${i + 1}`, "Coffee", `coffeetable_wood_${i + 1}.png`, 32, 16, 2, 1),
  ),
  ...Array.from({ length: 3 }, (_, i) =>
    item(`coffeetable_glass_${i + 1}`, `Glass Table ${i + 1}`, "Coffee", `coffeetable_glass_${i + 1}.png`, 32, 16, 2, 1),
  ),
  ...Array.from({ length: 3 }, (_, i) =>
    item(`sidetable_${i + 1}`, `Side Table ${i + 1}`, "Coffee", `sidetable_${i + 1}.png`, 16, 16, 1, 1),
  ),

  // ─── Chairs (Wooden) ───────────────────────────────────────
  ...["birch", "oak", "walnut", "cherry", "mahogany", "maple", "ash", "dark", "gray", "charcoal"].flatMap((c) => [
    seatItem(`chair_wood_${c}_front`, `${c} (F)`, "Chairs", `chair_wood_${c}_front.png`, 16, 32, 1, 2),
    seatItem(`chair_wood_${c}_back`, `${c} (B)`, "Chairs", `chair_wood_${c}_back.png`, 16, 32, 1, 2),
  ]),

  // ─── Chairs (Cushioned) ────────────────────────────────────
  ...["birch", "oak", "walnut", "cherry", "mahogany", "maple", "ash", "dark", "gray", "charcoal"].map((c) =>
    seatItem(`chair_cushion_${c}_front`, `Cushion ${c}`, "Chairs", `chair_cushion_${c}_front.png`, 16, 32, 1, 2),
  ),

  // ─── Office Chairs ─────────────────────────────────────────
  ...["brown", "tan", "gray", "dark", "red", "teal", "blue", "green", "pink", "olive", "navy", "slate"].flatMap((c) => [
    seatItem(`chair_office_${c}_front`, `Office ${c} (F)`, "Office", `chair_office_${c}_front.png`, 16, 32, 1, 2),
    seatItem(`chair_office_${c}_side`, `Office ${c} (S)`, "Office", `chair_office_${c}_side.png`, 16, 32, 1, 2),
  ]),

  // ─── Puffs ──────────────────────────────────────────────────
  ...["beige", "gray", "dark", "teal", "blue"].map((c) =>
    seatItem(`puff_${c}`, `Puff ${c}`, "Office", `puff_${c}.png`, 16, 16, 1, 1),
  ),

  // ─── Plants ─────────────────────────────────────────────────
  ...["brown", "blue", "terra", "green"].map((c) =>
    item(`plant_bush_${c}`, `Bush ${c}`, "Plants", `plant_bush_${c}.png`, 16, 32, 1, 2),
  ),
  ...["brown", "blue", "terra", "green"].map((c) =>
    item(`plant_snake_${c}`, `Snake ${c}`, "Plants", `plant_snake_${c}.png`, 16, 32, 1, 2),
  ),

  // ─── Flowers ────────────────────────────────────────────────
  ...Array.from({ length: 3 }, (_, i) =>
    item(`flower_tulip_${i + 1}`, `Tulip ${i + 1}`, "Plants", `flower_tulip_${i + 1}.png`, 16, 32, 1, 2),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    item(`flower_lily_${i + 1}`, `Lily ${i + 1}`, "Plants", `flower_lily_${i + 1}.png`, 16, 32, 1, 2),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    item(`flower_rose_${i + 1}`, `Rose ${i + 1}`, "Plants", `flower_rose_${i + 1}.png`, 16, 32, 1, 2),
  ),

  // ─── Lamps ──────────────────────────────────────────────────
  ...["black", "bronze", "gold", "silver", "dark", "copper"].map((c) =>
    item(`lamp_${c}`, `Lamp ${c}`, "Lighting", `lamp_${c}.png`, 16, 32, 1, 2),
  ),

  // ─── TVs/Monitors ──────────────────────────────────────────
  ...["beige", "gray", "black", "red", "orange", "green", "lime", "teal", "dark_teal", "purple", "pink", "lavender"].map((c) =>
    item(`tv_${c}`, `TV ${c}`, "TVs", `tv_${c}.png`, 16, 32, 1, 2),
  ),

  // ─── Posters (wall items) ────────────────────────────────────
  ...["cat", "pink", "tiger", "blue", "skull", "pacman", "fire", "robot", "alien", "hero", "game", "pixel"].map((n) =>
    wallItem(`poster_${n}`, `Poster ${n}`, "Wall Art", `poster_${n}.png`, 16, 16, 1, 1),
  ),

  // ─── Paintings (wall items) ─────────────────────────────────
  ...["heart_pink", "heart_orange", "heart_blue", "heart_purple", "circle_1", "circle_2"].map((n) =>
    wallItem(`painting_${n}`, n.replace("_", " "), "Wall Art", `painting_${n}.png`, 16, 16, 1, 1),
  ),

  // ─── Bookshelves ────────────────────────────────────────────
  ...["birch", "oak", "walnut", "cherry", "mahogany", "maple", "dark"].map((c) =>
    item(`bookshelf_${c}`, `Shelf ${c}`, "Storage", `bookshelf_${c}.png`, 32, 32, 2, 2),
  ),

  // ─── Wall Shelves (wall items) ───────────────────────────────
  ...["birch", "oak", "walnut", "cherry", "dark"].map((c) =>
    wallItem(`wallshelf_${c}`, `Wall ${c}`, "Storage", `wallshelf_${c}.png`, 48, 16, 3, 1),
  ),

  // ─── Barrels ────────────────────────────────────────────────
  ...["light", "medium", "dark", "stone"].map((c) =>
    item(`barrel_${c}`, `Barrel ${c}`, "Storage", `barrel_${c}.png`, 16, 16, 1, 1),
  ),

  // ─── Rugs ───────────────────────────────────────────────────
  rugItem("rug_circle_red", "Rug Red", "Rugs", "rug_circle_red.png", 32, 32, 2, 2),
  rugItem("rug_circle_blue", "Rug Blue", "Rugs", "rug_circle_blue.png", 32, 32, 2, 2),
  rugItem("rug_circle_teal", "Rug Teal", "Rugs", "rug_circle_teal.png", 32, 32, 2, 2),
  rugItem("rug_circle_green", "Rug Green", "Rugs", "rug_circle_green.png", 32, 32, 2, 2),
  rugItem("rug_rect_1", "Rug Rect 1", "Rugs", "rug_rect_1.png", 48, 32, 3, 2),
  rugItem("rug_rect_2", "Rug Rect 2", "Rugs", "rug_rect_2.png", 48, 32, 3, 2),
  rugItem("rug_large_1", "Rug Large 1", "Rugs", "rug_large_1.png", 64, 48, 4, 3),
  rugItem("rug_large_2", "Rug Large 2", "Rugs", "rug_large_2.png", 64, 48, 4, 3),
];

const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))];

// ─── Editor state types ──────────────────────────────────────
interface PlacedFurniture extends FurnitureObject {
  catalogId: string;
}

interface EditorState {
  selectedItem: CatalogItem | null;
  selectedFurniture: string | null;
  ghostTileX: number;
  ghostTileY: number;
  ghostValid: boolean;
}

interface EditorModeProps {
  map: GameMap;
  canvas: HTMLCanvasElement;
  slug: string;
  onSave: (map: GameMap) => void;
  onExit: () => void;
}

// ─── Sprite preview component ────────────────────────────────
function SpritePreview({ file, animated, pw, ph, maxH = 48 }: { file: string; animated?: boolean; pw: number; ph: number; maxH?: number }) {
  const scale = Math.min(3, Math.floor(maxH / ph));
  const w = pw * scale;
  const h = ph * scale;
  const ext = animated ? file : file;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${COZY_BASE}/${ext}`}
      alt=""
      width={w}
      height={h}
      style={{ width: w, height: h, imageRendering: "pixelated" }}
      loading="lazy"
    />
  );
}

export default function EditorMode({ map, canvas, slug, onSave, onExit }: EditorModeProps) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [furniture, setFurniture] = useState<PlacedFurniture[]>(() =>
    map.furniture.map((f) => ({ ...f, catalogId: f.sprite.toLowerCase() }))
  );
  const [editor, setEditor] = useState<EditorState>({
    selectedItem: null,
    selectedFurniture: null,
    ghostTileX: -1,
    ghostTileY: -1,
    ghostValid: false,
  });
  const [saving, setSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [undoStack, setUndoStack] = useState<PlacedFurniture[][]>([]);

  const editorRef = useRef(editor);
  editorRef.current = editor;
  const furnitureRef = useRef(furniture);
  furnitureRef.current = furniture;
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  const ts = map.tileSize;

  // ─── Collision helpers ──────────────────────────────────────
  /** Get tiles occupied by collidable furniture (dynamic collision) */
  const getFurnitureOccupied = useCallback((furn: PlacedFurniture[], exclude?: string): Set<string> => {
    const occupied = new Set<string>();
    for (const f of furn) {
      if (!f.collides) continue;
      if (exclude && f.id === exclude) continue;
      const ftx = Math.floor(f.x / ts);
      const fty = Math.floor(f.y / ts);
      const ftw = Math.floor(f.width / ts);
      const fth = Math.floor(f.height / ts);
      for (let dy = 0; dy < fth; dy++) {
        for (let dx = 0; dx < ftw; dx++) {
          occupied.add(`${ftx + dx},${fty + dy}`);
        }
      }
    }
    return occupied;
  }, [ts]);

  const canPlace = useCallback((itm: CatalogItem, tileX: number, tileY: number, exclude?: string): boolean => {
    const rw = itm.tw, rh = itm.th;
    // Bounds check
    if (tileX < 0 || tileY < 0 || tileX + rw > map.width || tileY + rh > map.height) return false;

    if (itm.placement === "wall") {
      // Wall items: ALL target tiles must be structural wall
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          if (getTileType(map, tileX + dx, tileY + dy) !== "wall") return false;
        }
      }
      return true;
    }

    if (itm.placement === "rug") {
      // Rugs: target tiles must be structural floor/door, can overlap furniture
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          const t = getTileType(map, tileX + dx, tileY + dy);
          if (t === "wall") return false;
        }
      }
      return true;
    }

    // Floor items: must be on structural floor/door AND not overlapping collidable furniture
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const t = getTileType(map, tileX + dx, tileY + dy);
        if (t === "wall") return false;
      }
    }
    if (!itm.collides) return true; // non-collidable floor items can stack
    const occupied = getFurnitureOccupied(furnitureRef.current, exclude);
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        if (occupied.has(`${tileX + dx},${tileY + dy}`)) return false;
      }
    }
    return true;
  }, [map, getFurnitureOccupied]);

  // ─── Ghost sprite image cache ───────────────────────────────
  const ghostImgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const getGhostImg = useCallback((file: string): HTMLImageElement | null => {
    if (ghostImgCache.current.has(file)) return ghostImgCache.current.get(file)!;
    const img = new Image();
    img.src = `${COZY_BASE}/${file}`;
    img.onload = () => ghostImgCache.current.set(file, img);
    return null;
  }, []);

  // ─── Canvas overlay rendering ──────────────────────────────
  useEffect(() => {
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;z-index:55;";
    canvas.parentElement?.appendChild(overlayCanvas);

    let rafId: number;
    const drawOverlay = () => {
      const cam = getCameraState();
      overlayCanvas.width = cam.viewportW;
      overlayCanvas.height = cam.viewportH;
      const ctx = overlayCanvas.getContext("2d");
      if (!ctx) { rafId = requestAnimationFrame(drawOverlay); return; }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cam.viewportW, cam.viewportH);
      ctx.save();
      ctx.translate(Math.round(-cam.x), Math.round(-cam.y));

      if (showGridRef.current) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= map.width; x++) {
          ctx.beginPath();
          ctx.moveTo(x * ts, 0);
          ctx.lineTo(x * ts, map.height * ts);
          ctx.stroke();
        }
        for (let y = 0; y <= map.height; y++) {
          ctx.beginPath();
          ctx.moveTo(0, y * ts);
          ctx.lineTo(map.width * ts, y * ts);
          ctx.stroke();
        }
      }

      // ── Debug overlay ──
      if (showDebugRef.current) {
        ctx.font = "bold 7px monospace";
        ctx.textAlign = "center";

        // Draw collision tiles
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            const idx = y * map.width + x;
            if (map.layers.collision[idx] === 1) {
              ctx.fillStyle = "rgba(255, 50, 50, 0.2)";
              ctx.fillRect(x * ts + 1, y * ts + 1, ts - 2, ts - 2);
              ctx.fillStyle = "rgba(255, 100, 100, 0.6)";
              ctx.fillText("X", x * ts + ts / 2, y * ts + ts / 2 + 3);
            }
          }
        }

        // Draw objects
        for (const obj of map.objects) {
          const ox = (obj.x ?? 0) * ts;
          const oy = (obj.y ?? 0) * ts;
          const ow = (obj.width ?? 1) * ts;
          const oh = (obj.height ?? 1) * ts;

          if (obj.type === "seat") {
            ctx.fillStyle = "rgba(50, 255, 50, 0.3)";
            ctx.fillRect(ox + 2, oy + 2, ow - 4, oh - 4);
            ctx.strokeStyle = "rgba(50, 255, 50, 0.8)";
            ctx.lineWidth = 1;
            ctx.strokeRect(ox + 2, oy + 2, ow - 4, oh - 4);
            ctx.fillStyle = "#0f0";
            ctx.fillText(`sit ${obj.dir ?? "?"}`, ox + ow / 2, oy + oh / 2 + 3);
          } else if (obj.type === "arcade_machine") {
            ctx.fillStyle = "rgba(50, 100, 255, 0.3)";
            ctx.fillRect(ox + 2, oy + 2, ow - 4, oh - 4);
            ctx.fillStyle = "#66f";
            ctx.fillText("game", ox + ow / 2, oy + oh / 2 + 3);
          } else if (obj.type === "spawn") {
            ctx.fillStyle = "rgba(255, 255, 50, 0.3)";
            ctx.fillRect(ox + 2, oy + 2, ts - 4, ts - 4);
            ctx.fillStyle = "#ff0";
            ctx.fillText("S", ox + ts / 2, oy + ts / 2 + 3);
          } else if (obj.type === "elevator") {
            ctx.fillStyle = "rgba(255, 150, 50, 0.3)";
            ctx.fillRect(ox + 2, oy + 2, ow - 4, oh - 4);
            ctx.fillStyle = "#fa0";
            ctx.fillText("elev", ox + ow / 2, oy + oh / 2 + 3);
          }
        }

        // Draw furniture footprints
        for (const f of furnitureRef.current) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(f.x + 1, f.y + 1, f.width - 2, f.height - 2);
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
          ctx.fillText(f.sprite.replace(/sofa_|chair_|plant_/g, "").slice(0, 8), f.x + f.width / 2, f.y + 8);
        }
      }

      const ed = editorRef.current;
      if (ed.selectedItem && ed.ghostTileX >= 0) {
        const gx = ed.ghostTileX * ts;
        const gy = ed.ghostTileY * ts;
        const gw = ed.selectedItem.tw * ts;
        const gh = ed.selectedItem.th * ts;
        const validColor = ed.ghostValid ? "rgba(80, 200, 80," : "rgba(200, 80, 80,";
        if (ed.selectedItem.placement === "wall") {
          ctx.fillStyle = ed.ghostValid ? "rgba(80, 140, 240, 0.2)" : "rgba(200, 80, 80, 0.25)";
        } else if (ed.selectedItem.placement === "rug") {
          ctx.fillStyle = ed.ghostValid ? "rgba(180, 120, 240, 0.2)" : "rgba(200, 80, 80, 0.25)";
        } else {
          ctx.fillStyle = ed.ghostValid ? "rgba(80, 200, 80, 0.15)" : "rgba(200, 80, 80, 0.25)";
        }
        ctx.fillRect(gx, gy, gw, gh);

        // Draw the actual sprite as ghost preview
        const ghostImg = getGhostImg(ed.selectedItem.file);
        if (ghostImg) {
          ctx.save();
          ctx.globalAlpha = ed.ghostValid ? 0.7 : 0.3;
          ctx.drawImage(ghostImg, gx, gy, gw, gh);
          ctx.restore();
        }

        // Border
        ctx.strokeStyle = ed.ghostValid ? "rgba(255,255,255,0.4)" : "rgba(200, 80, 80, 0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
      }

      // Selected furniture: highlight + move ghost
      if (ed.selectedFurniture) {
        const f = furnitureRef.current.find((f) => f.id === ed.selectedFurniture);
        if (f) {
          // Highlight current position
          ctx.strokeStyle = "rgba(240, 192, 64, 0.9)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(f.x, f.y, f.width, f.height);
          ctx.setLineDash([]);
          // Label
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          const labelW = Math.max(f.width, 40);
          ctx.fillRect(f.x + f.width / 2 - labelW / 2, f.y - 12, labelW, 12);
          ctx.fillStyle = "#f0c040";
          ctx.font = "bold 7px monospace";
          ctx.textAlign = "center";
          ctx.fillText("click=move · Del=remove", f.x + f.width / 2, f.y - 3);

          // Ghost preview at cursor position (for moving)
          if (ed.ghostTileX >= 0 && !ed.selectedItem) {
            const mgx = ed.ghostTileX * ts;
            const mgy = ed.ghostTileY * ts;
            ctx.fillStyle = ed.ghostValid ? "rgba(80, 200, 80, 0.15)" : "rgba(200, 80, 80, 0.2)";
            ctx.fillRect(mgx, mgy, f.width, f.height);
            ctx.strokeStyle = ed.ghostValid ? "rgba(80, 200, 80, 0.5)" : "rgba(200, 80, 80, 0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(mgx + 0.5, mgy + 0.5, f.width - 1, f.height - 1);
          }
        }
      }

      ctx.restore();
      rafId = requestAnimationFrame(drawOverlay);
    };
    rafId = requestAnimationFrame(drawOverlay);
    return () => { cancelAnimationFrame(rafId); overlayCanvas.remove(); };
  }, [canvas, map, ts, getGhostImg]);

  // ─── Mouse interaction ─────────────────────────────────────
  useEffect(() => {
    const getTile = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cam = getCameraState();
      const sx = cam.viewportW / rect.width;
      const sy = cam.viewportH / rect.height;
      return {
        tx: Math.floor(((e.clientX - rect.left) * sx + cam.x) / ts),
        ty: Math.floor(((e.clientY - rect.top) * sy + cam.y) / ts),
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      const { tx, ty } = getTile(e);
      const ed = editorRef.current;
      if (ed.selectedItem) {
        setEditor((prev) => ({ ...prev, ghostTileX: tx, ghostTileY: ty, ghostValid: canPlace(ed.selectedItem!, tx, ty) }));
      }
      // Show ghost for moving selected furniture
      if (ed.selectedFurniture && !ed.selectedItem) {
        const f = furnitureRef.current.find((f) => f.id === ed.selectedFurniture);
        if (f) {
          const catItem = CATALOG.find((c) => c.id === f.catalogId || c.id === f.sprite);
          if (catItem) {
            const valid = canPlace(catItem, tx, ty, f.id);
            setEditor((prev) => ({ ...prev, ghostTileX: tx, ghostTileY: ty, ghostValid: valid }));
          }
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const { tx, ty } = getTile(e);
      const ed = editorRef.current;

      // Place new item from catalog
      if (ed.selectedItem) {
        if (!canPlace(ed.selectedItem, tx, ty)) return;
        const newId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const sprite = ed.selectedItem.id;
        const newF: PlacedFurniture = {
          id: newId,
          sprite,
          x: tx * ts,
          y: ty * ts,
          width: ed.selectedItem.tw * ts,
          height: ed.selectedItem.th * ts,
          collides: ed.selectedItem.collides,
          sortY: ty * ts + ed.selectedItem.th * ts,
          sittable: ed.selectedItem.interact === "seat",
          catalogId: ed.selectedItem.id,
        };
        setUndoStack((prev) => [...prev, furnitureRef.current]);
        setFurniture((prev) => [...prev, newF]);
        loadFurnitureSprites(COZY_BASE, [sprite]);

        // Interactive objects (seats, arcade machines) are rebuilt on save
        // by rebuildObjects() — no need to push here
        return;
      }

      // Move selected furniture to new position
      if (ed.selectedFurniture) {
        const f = furnitureRef.current.find((f) => f.id === ed.selectedFurniture);
        if (f) {
          // Check if clicking on the same furniture (deselect)
          const onSelf = tx >= f.x / ts && tx < f.x / ts + f.width / ts
            && ty >= f.y / ts && ty < f.y / ts + f.height / ts;
          if (onSelf) return; // clicking on self = keep selected

          const catItem = CATALOG.find((c) => c.id === f.catalogId || c.id === f.sprite);
          if (catItem) {
            if (canPlace(catItem, tx, ty, f.id)) {
              setUndoStack((prev) => [...prev, furnitureRef.current]);
              setFurniture((prev) => prev.map((item) =>
                item.id === f.id
                  ? { ...item, x: tx * ts, y: ty * ts, width: catItem.tw * ts, height: catItem.th * ts, sortY: ty * ts + catItem.th * ts }
                  : item
              ));
              return;
            }
          }
        }
      }

      // Select furniture under cursor
      const clicked = furnitureRef.current.find((f) =>
        tx >= f.x / ts && tx < f.x / ts + f.width / ts && ty >= f.y / ts && ty < f.y / ts + f.height / ts
      );
      setEditor((prev) => ({ ...prev, selectedFurniture: clicked?.id ?? null, selectedItem: null, ghostTileX: -1 }));
    };

    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      setEditor((prev) => ({ ...prev, selectedItem: null, selectedFurniture: null, ghostTileX: -1 }));
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onContext);
    return () => { canvas.removeEventListener("mousemove", onMouseMove); canvas.removeEventListener("click", onClick); canvas.removeEventListener("contextmenu", onContext); };
  }, [canvas, ts, canPlace]);

  // ─── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ed = editorRef.current;
      if ((e.key === "Delete" || e.key === "Backspace") && ed.selectedFurniture) {
        e.preventDefault();
        setUndoStack((prev) => [...prev, furnitureRef.current]);
        setFurniture((prev) => prev.filter((f) => f.id !== ed.selectedFurniture));
        // Also remove linked interactive object
        map.objects = map.objects.filter((o) => (o as unknown as Record<string, unknown>)._furnitureId !== ed.selectedFurniture);
        setEditor((prev) => ({ ...prev, selectedFurniture: null }));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        setUndoStack((prev) => {
          if (prev.length === 0) return prev;
          setFurniture(prev[prev.length - 1]);
          return prev.slice(0, -1);
        });
      }
      if (e.key === "Escape") {
        if (ed.selectedItem || ed.selectedFurniture) {
          setEditor((prev) => ({ ...prev, selectedItem: null, selectedFurniture: null, ghostTileX: -1 }));
        } else {
          onExit();
        }
      }
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        setShowGrid((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // ─── Rebuild interactive objects from furniture ─────────────
  const rebuildObjects = (furn: PlacedFurniture[]): typeof map.objects => {
    // Keep non-furniture objects (spawns, elevator, quotes)
    const kept = map.objects.filter((o) => {
      const t = o.type;
      return t === "spawn" || t === "elevator" || t === "quote";
    });

    // Generate seats and arcade_machine objects from furniture
    for (const f of furn) {
      const catItem = CATALOG.find((c) => c.id === f.catalogId || c.id === f.sprite);
      if (!catItem?.interact) continue;

      const ftx = Math.floor(f.x / ts);
      const fty = Math.floor(f.y / ts);
      const ftw = Math.floor(f.width / ts);
      const fth = Math.floor(f.height / ts);

      if (catItem.interact === "seat") {
        // Gather-style: no seat objects needed!
        // The renderer auto-detects player on sittable furniture tiles
        // The furniture has sittable=true which the renderer checks
        continue;
      } else if (catItem.interact === "arcade_machine") {
        // Arcade machine: interactive from 1 tile in front (below)
        for (let dx = 0; dx < ftw; dx++) {
          kept.push({ type: "arcade_machine", x: ftx + dx, y: fty + fth, dir: "up" } as typeof map.objects[number]);
        }
      }
    }

    return kept;
  };

  // ─── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanFurniture = furniture.map(({ catalogId, ...f }) => f);
      const newObjects = rebuildObjects(furniture);
      console.log("[editor save] Objects rebuilt:", newObjects.filter(o => o.type === "seat").map(o => `seat(${o.x},${o.y}) dir=${o.dir}`));
      console.log("[editor save] Furniture:", furniture.map(f => `${f.sprite} tile(${f.x/ts},${f.y/ts}) ${f.width/ts}x${f.height/ts}`));
      const updatedMap: GameMap = {
        ...map,
        furniture: cleanFurniture,
        objects: newObjects,
      };
      // Rebuild collision from structural tiles + furniture footprints
      rebuildCollision(updatedMap);
      const res = await fetch(`/api/arcade/rooms/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ map_json: updatedMap }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSave(updatedMap);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Sync furniture to map for live preview ────────────────
  useEffect(() => {
    map.furniture = furniture.map(({ catalogId, ...f }) => f);
    // Rebuild collision so gameplay stays consistent
    if (map.tileProperties) {
      rebuildCollision(map);
    }
  }, [furniture, map]);

  // ─── Filtered items ────────────────────────────────────────
  const filteredItems = CATALOG.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.label.toLowerCase().includes(q) || c.id.includes(q) || c.category.toLowerCase().includes(q);
    }
    return c.category === category;
  });

  return (
    <div className="absolute inset-0 z-[60] pointer-events-none">
      {/* Toolbar */}
      <div
        className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg px-3 py-1.5"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      >
        <span className="text-[11px] text-yellow-400 font-bold tracking-wide uppercase">Edit Mode</span>
        <span className="text-white/20">|</span>
        <button onClick={() => setShowGrid((g) => !g)} className={`cursor-pointer text-[10px] px-2 py-0.5 rounded transition-colors ${showGrid ? "text-white bg-white/15" : "text-white/50 hover:text-white/80"}`}>Grid</button>
        <button onClick={() => setShowDebug((d) => !d)} className={`cursor-pointer text-[10px] px-2 py-0.5 rounded transition-colors ${showDebug ? "text-orange-400 bg-orange-400/15" : "text-white/50 hover:text-white/80"}`}>Debug</button>
        <button onClick={() => setUndoStack((prev) => { if (prev.length === 0) return prev; setFurniture(prev[prev.length - 1]); return prev.slice(0, -1); })} disabled={undoStack.length === 0} className="cursor-pointer text-[10px] text-white/50 hover:text-white/80 px-2 py-0.5 rounded disabled:opacity-30 transition-colors">Undo</button>
        <button onClick={handleSave} disabled={saving} className="cursor-pointer text-[10px] text-green-400 hover:text-green-300 font-medium px-2 py-0.5 rounded bg-green-400/10 hover:bg-green-400/20 transition-colors disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        <button onClick={onExit} className="cursor-pointer text-[10px] text-white/50 hover:text-white/80 px-2 py-0.5 rounded transition-colors">Exit</button>
      </div>

      {/* Sidebar catalog */}
      <div
        className="pointer-events-auto absolute right-2 top-14 bottom-2 w-56 rounded-lg overflow-hidden flex flex-col"
        style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(8px)" }}
      >
        {/* Search */}
        <div className="p-2 border-b border-white/10">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sprites..."
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/25"
          />
        </div>

        {/* Category tabs */}
        {!searchQuery && (
          <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-white/10">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`cursor-pointer text-[9px] px-1.5 py-0.5 rounded-full transition-colors ${
                  cat === category ? "bg-white/20 text-white font-medium" : "text-white/40 hover:text-white/70"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Items grid with previews */}
        <div className="flex-1 overflow-y-auto p-1.5">
          <div className="grid grid-cols-2 gap-1">
            {filteredItems.map((itm) => (
              <button
                key={itm.id}
                onClick={() => setEditor((prev) => ({ ...prev, selectedItem: itm, selectedFurniture: null }))}
                className={`cursor-pointer flex flex-col items-center gap-1 p-1.5 rounded transition-colors ${
                  editor.selectedItem?.id === itm.id
                    ? "bg-yellow-400/20 ring-1 ring-yellow-400/50"
                    : "hover:bg-white/10"
                }`}
              >
                <div
                  className="flex items-center justify-center rounded"
                  style={{
                    minHeight: 40,
                    background: "rgba(255,255,255,0.03)",
                    backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.02) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.02) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.02) 75%)",
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
                  }}
                >
                  <SpritePreview file={itm.file} animated={itm.animated} pw={itm.pw} ph={itm.ph} />
                </div>
                <span className="text-[9px] text-white/60 leading-tight text-center">{itm.label}</span>
                {itm.placement !== "floor" && (
                  <span className={`text-[7px] px-1 rounded-full ${itm.placement === "wall" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                    {itm.placement}
                  </span>
                )}
              </button>
            ))}
          </div>
          {filteredItems.length === 0 && (
            <p className="text-[11px] text-white/25 text-center py-8">No items found</p>
          )}
        </div>

        {/* Selected furniture info */}
        {editor.selectedFurniture && (
          <div className="p-2 border-t border-white/10">
            <div className="text-[10px] text-white/50 mb-1">Selected furniture</div>
            <button
              onClick={() => {
                setUndoStack((prev) => [...prev, furnitureRef.current]);
                setFurniture((prev) => prev.filter((f) => f.id !== editor.selectedFurniture));
                map.objects = map.objects.filter((o) => (o as unknown as Record<string, unknown>)._furnitureId !== editor.selectedFurniture);
                setEditor((prev) => ({ ...prev, selectedFurniture: null }));
              }}
              className="cursor-pointer text-[10px] text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded w-full transition-colors"
            >
              Delete (Del)
            </button>
          </div>
        )}

        {/* Help */}
        <div className="p-2 border-t border-white/10 text-[8px] text-white/20 leading-relaxed">
          Click = place · Del = remove · G = grid · ⌘Z = undo · Esc = exit
        </div>
      </div>
    </div>
  );
}
