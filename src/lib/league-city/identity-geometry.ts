// ─── Identity piece sizes ───────────────────────────────────
// City units. Shared by the meshes (components/league/identity) and the drive
// colliders, so the car hits what it sees.

/** The entrance arch: two pillars either side of the road, a beam with the name. */
export const PORTAL = {
  /** Pillar centers at ±halfSpan from the portal, across the road (x). */
  halfSpan: 16,
  pillar: 3,
  height: 30,
  beam: 7,
} as const;

/** Wide billboard: logo and town name on a panel over two legs. */
export const BILLBOARD = { w: 28, h: 14, bottom: 12, legX: 10, leg: 1.2 } as const;

export const FLAG = { poleH: 30, pole: 0.45, clothW: 15, clothH: 10 } as const;

/**
 * The approach: the main street runs on past the city's south edge for this
 * many lots, outside the grid, so the portal reads as a way in. Drawn and
 * driven only; the editor and the SQL never see these lots.
 */
export const APPROACH_LOTS = 7;

/** Where the car starts when you have no building: on the approach, facing north through the portal. */
export const ENTRANCE_SPAWN = { x: 0, z: 48 * 1.4, rot: 0 } as const;
