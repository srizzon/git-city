// Shared geometry for the San Francisco civic plaza — the downtown landmark
// cluster (Bank, Founder Spire, E.Arcade, sponsors, fountain).
//
// Two places derive landmark positions from these numbers and MUST agree:
//   - CityCanvas.tsx — renders the 3D plaza group.
//   - home-client.tsx — computes the camera focus target for a sponsor click.
// Keep the single source of truth here so a tweak can't silently desync them.

/** Distance each landmark sits from the civic center, in local (pre-scale) units. */
export const SF_PLAZA_RADIUS = 360;

/** The whole landmark cluster is rendered inside a group scaled by this factor. */
export const SF_PLAZA_SCALE = 0.55;

/** Horizontal spacing between adjacent sponsors in the southern row (local units). */
export const SF_SPONSOR_SPACING = 200;

/**
 * Local `[x, z]` of sponsor `index` (out of `count`) in the plaza's southern
 * row, BEFORE the plaza group's {@link SF_PLAZA_SCALE} is applied. The row is
 * centered east–west on the civic center and offset south by
 * {@link SF_PLAZA_RADIUS}.
 */
export function sfSponsorLocalPos(index: number, count: number): [number, number] {
  const x = (index - (count - 1) / 2) * SF_SPONSOR_SPACING;
  const z = SF_PLAZA_RADIUS;
  return [x, z];
}
