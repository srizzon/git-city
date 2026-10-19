import { LOT } from "@/lib/league-city/grid";
import { CELL, PAINT_MINE, PAINT_RIVAL, stateAt, stateColor, type PaintBoard } from "@/lib/towns/brasil-paint";
import type { UF } from "@/lib/towns/brasil-map";

// The State War on the minimaps: the car's radar (cells round the car) and
// Brazil's corner map (the whole board, shrunk into a picture).

/** A state's color: lime for yours, else rival red in the car or its flag's on the map. */
export function paintColor(s: number, mine: UF | null, driving: boolean): string {
  const uf = stateAt(s);
  return uf === mine ? PAINT_MINE : driving || !uf ? PAINT_RIVAL : stateColor(uf);
}

/** The drive radar's layer: every painted cell within `reach` city units of (x, z), trails on top. */
export function radarLayer(board: PaintBoard, mine: UF | null) {
  return (ctx: CanvasRenderingContext2D, x: number, z: number, reach: number) => {
    const g = board.geom;
    if (!g) return;
    const i0 = Math.max(0, Math.floor((x - reach + LOT / 2) / CELL) - g.x0);
    const i1 = Math.min(g.w - 1, Math.floor((x + reach + LOT / 2) / CELL) - g.x0);
    const j0 = Math.max(0, Math.floor((z - reach + LOT / 2) / CELL) - g.z0);
    const j1 = Math.min(g.d - 1, Math.floor((z + reach + LOT / 2) / CELL) - g.z0);
    const at = (c: number) => [(g.x0 + (c % g.w)) * CELL - LOT / 2, (g.z0 + Math.floor(c / g.w)) * CELL - LOT / 2] as const;
    ctx.globalAlpha = 0.7;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * g.w + i;
        const s = board.heldAt(c);
        if (!s) continue;
        ctx.fillStyle = paintColor(s, mine, true);
        const [wx, wz] = at(c);
        ctx.fillRect(wx, wz, CELL + 0.5, CELL + 0.5);
      }
    }
    ctx.globalAlpha = 1;
    for (const t of board.trails.values()) {
      ctx.fillStyle = paintColor(t.s, mine, true);
      for (const c of t.cells) {
        const [wx, wz] = at(c);
        if (Math.abs(wx - x) > reach || Math.abs(wz - z) > reach) continue;
        ctx.fillRect(wx, wz, CELL + 0.5, CELL + 0.5);
      }
    }
  };
}

/**
 * The whole board as a small picture for Brazil's corner map: `px` cells to
 * a pixel, a pixel taking the color of any state in its square (so a small
 * patch still shows). Its place in city units comes with it.
 */
export function boardPicture(board: PaintBoard, mine: UF | null, px: number): { url: string; x: number; z: number; w: number; d: number } | null {
  const g = board.geom;
  if (!g || typeof document === "undefined") return null;
  const W = Math.ceil(g.w / px);
  const D = Math.ceil(g.d / px);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = D;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pick = new Uint8Array(W * D);
  for (let c = 0; c < board.owner.length; c++) {
    const s = board.heldAt(c);
    if (s) pick[Math.floor(Math.floor(c / g.w) / px) * W + Math.floor((c % g.w) / px)] = s;
  }
  for (let k = 0; k < pick.length; k++) {
    if (!pick[k]) continue;
    ctx.fillStyle = paintColor(pick[k], mine, false);
    ctx.fillRect(k % W, Math.floor(k / W), 1, 1);
  }
  return { url: canvas.toDataURL(), x: g.x0 * CELL - LOT / 2, z: g.z0 * CELL - LOT / 2, w: W * px * CELL, d: D * px * CELL };
}
