// ─── Every world's scenes, by name ──────────────────────────
// The scenes and takes each reel world plays, in one plain module: the
// validator and the CLI check specs against them without loading the
// three.js components that draw them.

export const BRASIL_SCENES = ["map", "overview", "dive", "lot-rise", "orbit", "wide", "pullback", "fill", "facade-rise", "drop", "push-in", "crown"] as const;
export const BRASIL_TAKES = ["track-drift", "track-top", "track-wide"] as const;
export const BAY_SCENES = ["fly", "rise-out", "drop", "push-in", "facade-rise", "sweep", "away", "lot", "pullback"] as const;
export const BAY_TAKES = ["car-cruise", "car-drift", "car-boost", "car-missile", "car-ramp", "crown-grab", "car-ram", "tower-fall", "fly-canyon", "boss", "league-crown"] as const;
export const TOWN_SCENES = ["tower", "collapse", "flag", "montage-hit", "intact", "circle", "pull-off"] as const;

export const WORLD_SCENES: Record<string, readonly string[]> = {
  brasil: [...BRASIL_SCENES, ...BRASIL_TAKES],
  bay: [...BAY_SCENES, ...BAY_TAKES],
  towns: TOWN_SCENES,
};
