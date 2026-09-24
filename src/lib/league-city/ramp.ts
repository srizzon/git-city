// ─── Ramp ───────────────────────────────────────────────────
// A wedge prop for drive mode. At rot 0 it faces north (-z): the low edge is
// on the south side and it rises to HEIGHT at the north edge, so a car
// driving north launches off it. Shared by the renderer and the colliders.

export const RAMP = { length: 28, width: 14, height: 8 } as const;

/** The wedge's 6 corners in local units (y up, centered on the footprint). */
export function rampCorners(): [number, number, number][] {
  const w = RAMP.width / 2;
  const l = RAMP.length / 2;
  const h = RAMP.height;
  return [
    [-w, 0, -l],
    [w, 0, -l],
    [w, 0, l],
    [-w, 0, l],
    [-w, h, -l],
    [w, h, -l],
  ];
}
