// ─── Rivalry piece sizes ────────────────────────────────────
// City units. Shared by the meshes (components/league/identity/RivalryPieces)
// and the drive colliders, so the car hits what it sees.

export const MASCOT_SCALE = { small: 1, giant: 7 } as const;
export type MascotSize = keyof typeof MASCOT_SCALE;

export function mascotSize(props: Record<string, unknown> | null | undefined): MascotSize {
  return props?.size === "giant" ? "giant" : "small";
}

/** Clawd: sizes in body units `u`, standing on a 3-step plinth when giant. */
export const CLAWD = {
  unit: 1.6,
  plinthStep: 12,
  plinthSteps: 3,
  /** Step i is (plinthW - i * plinthShrinkW) × (plinthD - i * plinthShrinkD) units wide. */
  plinthW: 12,
  plinthD: 8,
  plinthShrinkW: 1.6,
  plinthShrinkD: 1.2,
  legH: 2,
  bodyW: 8,
  bodyH: 5,
  bodyD: 5,
  /** Arms reach this far from the center, in units. */
  reach: 5.8,
} as const;

export function clawdUnit(size: MascotSize): number {
  return CLAWD.unit * MASCOT_SCALE[size];
}

export function clawdBase(size: MascotSize): number {
  return size === "giant" ? CLAWD.plinthStep * CLAWD.plinthSteps : 0;
}

/** The Codex cloud: hovers over a round pad. Cloud box in units `u`. */
export const CLOUD = {
  unit: 1.5,
  hover: { small: 4, giant: 30 },
  padR: 4.4,
  padH: 0.8,
  /** Bounding box of the voxel cloud, in units, relative to its hover point. */
  x0: -5.5,
  x1: 5.9,
  top: 8.5,
  halfD: 2.5,
} as const;

export function cloudUnit(size: MascotSize): number {
  return CLOUD.unit * MASCOT_SCALE[size];
}

/** The context window: a W × H screen on two legs `base` tall. */
export const CONTEXT_WINDOW = { w: 110, h: 66, base: 46, leg: 4, legX: 110 / 3, depth: 2.4 } as const;

/** The sandbox: an S × S pit, the whole piece drawn at `scale`. */
export const SANDBOX = { size: 62, scale: 1.4, fenceH: 4.4, castleW: 18, castleD: 12, castleH: 11, castleZ: -4 } as const;
