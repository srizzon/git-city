// ─── Drift spots ────────────────────────────────────────────
// A spot is a drift course: its track, the asphalt it's laid in, its clipping
// points, the author's score (the medals hang off it) and the shortest run
// the server believes. Spots still to come have only a name.

import type { Surface } from "../../league-city/drive/surface";
import type { TrackSpec } from "../../league-city/race/track";
import type { Clip } from "../score";

export type SpotId = "harbor" | "touge" | "brasil" | "cold-storage" | "salt-flat" | "permafrost" | "spiral";

export interface LiveSpot {
  id: SpotId;
  status: "live";
  name: string;
  /** One line under the name. */
  tagline: string;
  /** The same in Portuguese, for a spot on the Brasil map. */
  taglinePt?: string;
  track: TrackSpec;
  surface: Surface;
  clips: Clip[];
  /** The author's best score: author medal; gold, silver and bronze are shares of it. */
  author: number;
  /** No real run is shorter than this (ms). */
  minMs: number;
}

export interface SoonSpot {
  id: SpotId;
  status: "soon";
  name: string;
  tagline: string;
}

export type Spot = LiveSpot | SoonSpot;

export type Medal = "author" | "gold" | "silver" | "bronze";

/** Medal thresholds as shares of the author's score (Trackmania's spread, turned around for points). */
export const MEDAL_SHARE: [Medal, number][] = [
  ["author", 1],
  ["gold", 0.9],
  ["silver", 0.75],
  ["bronze", 0.5],
];

export function medalScores(spot: LiveSpot): [Medal, number][] {
  return MEDAL_SHARE.map(([m, share]) => [m, Math.round(spot.author * share)]);
}

/** The best medal a score earns, or null. */
export function medalFor(spot: LiveSpot, score: number | null): Medal | null {
  if (score === null) return null;
  for (const [m, at] of medalScores(spot)) if (score >= at) return m;
  return null;
}
