// ─── Ramps ──────────────────────────────────────────────────
// Wedge props for drive mode. At rot 0 a ramp faces north (-z): the low edge
// is on the south side and it rises to `height` at the north edge, so a car
// driving north launches off it. Shared by the renderer and the colliders.

export interface RampSize {
  length: number;
  width: number;
  height: number;
}

export const RAMP: RampSize = { length: 28, width: 14, height: 8 };
export const RAMP_BIG: RampSize = { length: 40, width: 18, height: 12 };

/** The wedge's 6 corners in local units (y up, centered on the footprint). */
export function rampCorners(size: RampSize = RAMP): [number, number, number][] {
  const w = size.width / 2;
  const l = size.length / 2;
  const h = size.height;
  return [
    [-w, 0, -l],
    [w, 0, -l],
    [w, 0, l],
    [-w, 0, l],
    [-w, h, -l],
    [w, h, -l],
  ];
}
