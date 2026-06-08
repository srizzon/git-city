export interface BuildingColors {
  windowLit: string[];
  windowOff: string;
  face: string;
  roof: string;
  accent: string;
}

export interface SkyFXConfig {
  disc: {
    type: "moon" | "sun" | "synth" | "radial" | "none";
    elevDeg: number;
    dist: number;
    scale: number;
    color?: string;
    opacity?: number;
  };
  stars?: {
    count: number;
    dist: number;
    minElev: number;
    color: [number, number, number]; // RGB multipliers
  };
  dust?: {
    count: number;
    color1: [number, number, number];
    color2: [number, number, number];
  };
  fireflies?: {
    count: number;
  };
  aurora?: boolean;
  sunsetHaze?: boolean;
  sunsetCirrus?: boolean;
  shootingStars?: {
    dur: number;
    nextIn: number;
    color: [number, number, number]; // RGB multipliers
    pulseDur?: number;
    pulseNextIn?: number;
    pulseOpacityBump?: number;
  };
}

export interface CityTheme {
  name: string;
  accent: string;
  shadow: string;
  sky: [number, string][];
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  fillColor: string;
  fillIntensity: number;
  fillPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  groundColor: string;
  grid1: string;
  grid2: string;
  roadMarkingColor: string;
  sidewalkColor: string;
  building: BuildingColors;
  waterColor: string;
  waterEmissive: string;
  dockColor: string;
  skyFX: SkyFXConfig;
}

export const THEMES: Record<string, CityTheme> = {
  emerald: {
    name: "Emerald",
    accent: "#f0c060",
    shadow: "#806020",
    sky: [
      [0, "#000804"], [0.15, "#001408"], [0.30, "#002810"], [0.42, "#003c1c"],
      [0.52, "#004828"], [0.60, "#003820"], [0.75, "#002014"], [0.90, "#001008"],
      [1, "#000604"],
    ],
    fogColor: "#0a2014", fogNear: 400, fogFar: 3500,
    ambientColor: "#40a060", ambientIntensity: 0.55,
    sunColor: "#70d090", sunIntensity: 0.75, sunPos: [300, 100, -250],
    fillColor: "#20a080", fillIntensity: 0.35, fillPos: [-200, 60, 200],
    hemiSky: "#50b068", hemiGround: "#183020", hemiIntensity: 0.5,
    groundColor: "#1e3020", grid1: "#2c4838", grid2: "#243828",
    roadMarkingColor: "#60c080",
    sidewalkColor: "#404848",
    building: {
      windowLit: ["#0e4429", "#006d32", "#26a641", "#39d353", "#c8e64a"],
      windowOff: "#060e08", face: "#0c1810", roof: "#1e4028",
      accent: "#f0c060",
    },
    waterColor: "#082018", waterEmissive: "#0a3020", dockColor: "#3a2818",
    skyFX: {
      // Historically maps to ThemeSkyFX index 0 (Midnight moon + stars)
      disc: { type: "moon", elevDeg: 14, dist: 900, scale: 110 },
      stars: { count: 900, dist: 900, minElev: 6, color: [0.85, 0.92, 1.20] },
      shootingStars: { dur: 0.5, nextIn: 18, color: [1.2, 1.2, 1.6] }
    }
  },
  midnight: {
    name: "Midnight",
    accent: "#6090e0",
    shadow: "#203870",
    sky: [
      [0, "#000206"], [0.15, "#020814"], [0.30, "#061428"], [0.45, "#0c2040"],
      [0.55, "#102850"], [0.65, "#0c2040"], [0.80, "#061020"], [1, "#020608"],
    ],
    fogColor: "#0a1428", fogNear: 400, fogFar: 3500,
    ambientColor: "#4060b0", ambientIntensity: 0.55,
    sunColor: "#7090d0", sunIntensity: 0.75, sunPos: [300, 120, -200],
    fillColor: "#304080", fillIntensity: 0.3, fillPos: [-200, 60, 200],
    hemiSky: "#5080a0", hemiGround: "#202830", hemiIntensity: 0.5,
    groundColor: "#242c38", grid1: "#344050", grid2: "#2c3848",
    roadMarkingColor: "#8090a0",
    sidewalkColor: "#484c58",
    building: {
      windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
      windowOff: "#0c0e18", face: "#101828", roof: "#2a3858",
      accent: "#6090e0",
    },
    waterColor: "#0a1830", waterEmissive: "#0a2050", dockColor: "#3a2818",
    skyFX: {
      // Historically maps to ThemeSkyFX index 1 (Sunset clouds + sun)
      disc: { type: "sun", elevDeg: 7, dist: 850, scale: 200, opacity: 0.88 },
      sunsetHaze: true,
      sunsetCirrus: true,
      shootingStars: { dur: 0.5, nextIn: 18, color: [1.6, 1.1, 0.6], pulseDur: 0.5, pulseNextIn: 10, pulseOpacityBump: 0.12 }
    }
  },
  sunset: {
    name: "Sunset",
    accent: "#c8e64a",
    shadow: "#5a7a00",
    sky: [
      [0, "#0c0614"], [0.15, "#1c0e30"], [0.28, "#3a1850"], [0.38, "#6a3060"],
      [0.46, "#a05068"], [0.52, "#d07060"], [0.57, "#e89060"], [0.62, "#f0b070"],
      [0.68, "#f0c888"], [0.75, "#c08060"], [0.85, "#603030"], [1, "#180c10"],
    ],
    fogColor: "#80405a", fogNear: 400, fogFar: 3500,
    ambientColor: "#e0a080", ambientIntensity: 0.7,
    sunColor: "#f0b070", sunIntensity: 1.0, sunPos: [400, 120, -300],
    fillColor: "#6050a0", fillIntensity: 0.35, fillPos: [-200, 80, 200],
    hemiSky: "#d09080", hemiGround: "#4a2828", hemiIntensity: 0.55,
    groundColor: "#3a3038", grid1: "#504048", grid2: "#443838",
    roadMarkingColor: "#d0a840",
    sidewalkColor: "#585058",
    building: {
      windowLit: ["#f8d880", "#f0b860", "#e89840", "#d07830", "#f0c060"],
      windowOff: "#1a1018", face: "#281828", roof: "#604050",
      accent: "#c8e64a",
    },
    waterColor: "#1a2040", waterEmissive: "#102060", dockColor: "#4a3020",
    skyFX: {
      // Historically maps to ThemeSkyFX index 2 (Neon dust + synth disc)
      disc: { type: "synth", elevDeg: 5, dist: 800, scale: 300 },
      stars: { count: 600, dist: 850, minElev: 8, color: [1.10, 0.80, 1.35] },
      dust: { count: 400, color1: [2.5, 0.4, 2.2], color2: [0.4, 2.2, 2.5] },
      shootingStars: { dur: 0.12, nextIn: 4, color: [2.6, 0.6, 2.4], pulseDur: 0.12, pulseNextIn: 3.5, pulseOpacityBump: 0.40 }
    }
  },
  neon: {
    name: "Neon",
    accent: "#e040c0",
    shadow: "#600860",
    sky: [
      [0, "#06001a"], [0.15, "#100028"], [0.30, "#200440"], [0.42, "#380650"],
      [0.52, "#500860"], [0.60, "#380648"], [0.75, "#180230"], [0.90, "#0c0118"],
      [1, "#06000c"],
    ],
    fogColor: "#1a0830", fogNear: 400, fogFar: 3500,
    ambientColor: "#8040c0", ambientIntensity: 0.6,
    sunColor: "#c050e0", sunIntensity: 0.85, sunPos: [300, 100, -200],
    fillColor: "#00c0d0", fillIntensity: 0.4, fillPos: [-250, 60, 200],
    hemiSky: "#9040d0", hemiGround: "#201028", hemiIntensity: 0.5,
    groundColor: "#2c2038", grid1: "#3c2c50", grid2: "#342440",
    roadMarkingColor: "#c060e0",
    sidewalkColor: "#484058",
    building: {
      windowLit: ["#ff40c0", "#c040ff", "#00e0ff", "#40ff80", "#ff8040"],
      windowOff: "#0a0814", face: "#180830", roof: "#3c1858",
      accent: "#e040c0",
    },
    waterColor: "#0c0830", waterEmissive: "#1008a0", dockColor: "#2a1838",
    skyFX: {
      // Historically maps to ThemeSkyFX index 3 (Emerald green orb + fireflies + aurora)
      disc: { type: "radial", elevDeg: 14, dist: 800, scale: 110, color: "rgba(180,255,210,1.0)" },
      stars: { count: 300, dist: 900, minElev: 12, color: [0.65, 1.10, 0.85] },
      fireflies: { count: 280 },
      aurora: true
    }
  },
  aurora: {
    name: "Aurora",
    accent: "#a855f7",
    shadow: "#581c87",
    sky: [
      [0, "#020617"], [0.35, "#0f172a"], [0.70, "#1e1b4b"], [1, "#020617"]
    ],
    fogColor: "#0f172a", fogNear: 400, fogFar: 3500,
    ambientColor: "#a855f7", ambientIntensity: 0.6,
    sunColor: "#0ea5e9", sunIntensity: 0.8, sunPos: [300, 100, -200],
    fillColor: "#6366f1", fillIntensity: 0.4, fillPos: [-250, 60, 200],
    hemiSky: "#a855f7", hemiGround: "#1e1b4b", hemiIntensity: 0.5,
    groundColor: "#0f172a", grid1: "#1e293b", grid2: "#0f172a",
    roadMarkingColor: "#a855f7",
    sidewalkColor: "#1e293b",
    building: {
      windowLit: ["#38bdf8", "#818cf8", "#c084fc", "#e879f9"],
      windowOff: "#090d16", face: "#0f172a", roof: "#1e1b4b",
      accent: "#a855f7",
    },
    waterColor: "#083344", waterEmissive: "#0f172a", dockColor: "#2e1065",
    skyFX: {
      disc: { type: "radial", elevDeg: 12, dist: 800, scale: 120, color: "rgba(168,85,247,0.8)" },
      stars: { count: 600, dist: 850, minElev: 10, color: [0.85, 0.70, 1.25] },
      aurora: true,
      shootingStars: { dur: 0.5, nextIn: 15, color: [1.6, 1.0, 1.8] }
    }
  },
  desert: {
    name: "Desert",
    accent: "#87ceeb",
    shadow: "#c08457",
    sky: [
      [0, "#7c2d12"], [0.30, "#c08457"], [0.60, "#d6b98c"], [1, "#fef3c7"]
    ],
    fogColor: "#d6b98c", fogNear: 400, fogFar: 3500,
    ambientColor: "#fef3c7", ambientIntensity: 0.75,
    sunColor: "#facc15", sunIntensity: 1.0, sunPos: [400, 150, -300],
    fillColor: "#c08457", fillIntensity: 0.4, fillPos: [-200, 80, 200],
    hemiSky: "#fef3c7", hemiGround: "#7c2d12", hemiIntensity: 0.6,
    groundColor: "#c08457", grid1: "#d6b98c", grid2: "#7c2d12",
    roadMarkingColor: "#facc15",
    sidewalkColor: "#a16207",
    building: {
      windowLit: ["#fef3c7", "#fde047", "#facc15", "#eab308"],
      windowOff: "#431407", face: "#7c2d12", roof: "#78350f",
      accent: "#facc15",
    },
    waterColor: "#0284c7", waterEmissive: "#0369a1", dockColor: "#451a03",
    skyFX: {
      disc: { type: "sun", elevDeg: 7, dist: 850, scale: 220, opacity: 0.90 },
      sunsetCirrus: true,
      sunsetHaze: true,
      shootingStars: { dur: 0.5, nextIn: 20, color: [1.8, 1.5, 0.8] }
    }
  },
  ice: {
    name: "Ice",
    accent: "#94a3b8",
    shadow: "#475569",
    sky: [
      [0, "#0f172a"], [0.40, "#38bdf8"], [0.80, "#e2e8f0"], [1, "#f8fafc"]
    ],
    fogColor: "#e2e8f0", fogNear: 400, fogFar: 3500,
    ambientColor: "#bae6fd", ambientIntensity: 0.8,
    sunColor: "#ffffff", sunIntensity: 1.1, sunPos: [300, 180, -200],
    fillColor: "#94a3b8", fillIntensity: 0.3, fillPos: [-200, 60, 200],
    hemiSky: "#bae6fd", hemiGround: "#475569", hemiIntensity: 0.7,
    groundColor: "#cbd5e1", grid1: "#f1f5f9", grid2: "#94a3b8",
    roadMarkingColor: "#bae6fd",
    sidewalkColor: "#94a3b8",
    building: {
      windowLit: ["#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8"],
      windowOff: "#0f172a", face: "#475569", roof: "#334155",
      accent: "#38bdf8",
    },
    waterColor: "#e0f2fe", waterEmissive: "#bae6fd", dockColor: "#1e293b",
    skyFX: {
      disc: { type: "moon", elevDeg: 14, dist: 900, scale: 110 },
      stars: { count: 900, dist: 900, minElev: 6, color: [0.8, 1.0, 1.2] },
      shootingStars: { dur: 0.5, nextIn: 18, color: [1.0, 1.3, 1.6] }
    }
  },
  matrix: {
    name: "Matrix",
    accent: "#00ff00",
    shadow: "#003300",
    sky: [
      [0, "#000000"], [0.50, "#001100"], [1, "#000000"]
    ],
    fogColor: "#000000", fogNear: 400, fogFar: 3500,
    ambientColor: "#00ff00", ambientIntensity: 0.4,
    sunColor: "#00ff00", sunIntensity: 0.6, sunPos: [300, 100, -200],
    fillColor: "#003300", fillIntensity: 0.3, fillPos: [-200, 60, 200],
    hemiSky: "#00ff00", hemiGround: "#000000", hemiIntensity: 0.4,
    groundColor: "#000500", grid1: "#00ff00", grid2: "#003300",
    roadMarkingColor: "#00ff00",
    sidewalkColor: "#001100",
    building: {
      windowLit: ["#00ff00", "#00dd00", "#00aa00", "#008800"],
      windowOff: "#000000", face: "#000500", roof: "#001100",
      accent: "#00ff00",
    },
    waterColor: "#000000", waterEmissive: "#001100", dockColor: "#001100",
    skyFX: {
      disc: { type: "radial", elevDeg: 12, dist: 850, scale: 120, color: "rgba(0,255,0,0.8)" },
      stars: { count: 600, dist: 850, minElev: 8, color: [0.5, 1.5, 0.5] },
      dust: { count: 400, color1: [0.1, 2.5, 0.1], color2: [0.0, 1.2, 0.0] },
      shootingStars: { dur: 0.12, nextIn: 5, color: [0.2, 2.6, 0.2] }
    }
  },
  pastel: {
    name: "Pastel",
    accent: "#fed7aa",
    shadow: "#a7f3d0",
    sky: [
      [0, "#fef08a"], [0.35, "#fbcfe8"], [0.70, "#d8b4fe"], [1, "#c084fc"]
    ],
    fogColor: "#fae8ff", fogNear: 400, fogFar: 3500,
    ambientColor: "#d8b4fe", ambientIntensity: 0.7,
    sunColor: "#fed7aa", sunIntensity: 0.9, sunPos: [300, 120, -200],
    fillColor: "#a7f3d0", fillIntensity: 0.4, fillPos: [-200, 60, 200],
    hemiSky: "#d8b4fe", hemiGround: "#fae8ff", hemiIntensity: 0.6,
    groundColor: "#f5f3ff", grid1: "#fbcfe8", grid2: "#d8b4fe",
    roadMarkingColor: "#fbcfe8",
    sidewalkColor: "#e9d5ff",
    building: {
      windowLit: ["#fbcfe8", "#c084fc", "#a7f3d0", "#fed7aa"],
      windowOff: "#4a044e", face: "#d8b4fe", roof: "#c084fc",
      accent: "#fed7aa",
    },
    waterColor: "#e0f2fe", waterEmissive: "#a7f3d0", dockColor: "#fae8ff",
    skyFX: {
      disc: { type: "sun", elevDeg: 12, dist: 900, scale: 130, color: "rgba(254,215,170,0.8)", opacity: 0.8 },
      stars: { count: 300, dist: 900, minElev: 8, color: [1.2, 0.9, 1.2] },
      shootingStars: { dur: 0.5, nextIn: 18, color: [1.4, 0.9, 1.2] }
    }
  },
  monochrome: {
    name: "Monochrome",
    accent: "#ffffff",
    shadow: "#666666",
    sky: [
      [0, "#000000"], [0.50, "#333333"], [1, "#000000"]
    ],
    fogColor: "#111111", fogNear: 400, fogFar: 3500,
    ambientColor: "#ffffff", ambientIntensity: 0.5,
    sunColor: "#ffffff", sunIntensity: 0.8, sunPos: [300, 100, -200],
    fillColor: "#666666", fillIntensity: 0.3, fillPos: [-200, 60, 200],
    hemiSky: "#ffffff", hemiGround: "#111111", hemiIntensity: 0.5,
    groundColor: "#111111", grid1: "#666666", grid2: "#333333",
    roadMarkingColor: "#ffffff",
    sidewalkColor: "#222222",
    building: {
      windowLit: ["#ffffff", "#cccccc", "#999999", "#666666"],
      windowOff: "#000000", face: "#111111", roof: "#333333",
      accent: "#ffffff",
    },
    waterColor: "#000000", waterEmissive: "#222222", dockColor: "#333333",
    skyFX: {
      disc: { type: "moon", elevDeg: 14, dist: 900, scale: 110, color: "#ffffff", opacity: 0.9 },
      stars: { count: 900, dist: 900, minElev: 6, color: [1.0, 1.0, 1.0] },
      shootingStars: { dur: 0.5, nextIn: 18, color: [1.2, 1.2, 1.2] }
    }
  },
  highContrast: {
    name: "High Contrast",
    accent: "#00ff00",
    shadow: "#ffff00",
    sky: [
      [0, "#000000"], [1, "#000000"]
    ],
    fogColor: "#000000", fogNear: 400, fogFar: 3500,
    ambientColor: "#ffffff", ambientIntensity: 0.8,
    sunColor: "#ffffff", sunIntensity: 1.2, sunPos: [300, 100, -200],
    fillColor: "#ffffff", fillIntensity: 0.5, fillPos: [-200, 60, 200],
    hemiSky: "#ffffff", hemiGround: "#000000", hemiIntensity: 0.8,
    groundColor: "#000000", grid1: "#ffffff", grid2: "#ffff00",
    roadMarkingColor: "#00ff00",
    sidewalkColor: "#000000",
    building: {
      windowLit: ["#00ff00", "#ffff00", "#ffffff"],
      windowOff: "#000000", face: "#000000", roof: "#000000",
      accent: "#00ff00",
    },
    waterColor: "#000000", waterEmissive: "#000000", dockColor: "#000000",
    skyFX: {
      disc: { type: "moon", elevDeg: 14, dist: 900, scale: 110 },
      stars: { count: 300, dist: 900, minElev: 6, color: [1.0, 1.0, 1.0] },
      shootingStars: { dur: 0.5, nextIn: 18, color: [1.0, 1.0, 1.0] }
    }
  }
};

/** Get the list of all theme keys */
export function getThemeKeys(): string[] {
  return Object.keys(THEMES);
}

/** Retrieve a theme object by its key. Fallback to emerald. */
export function getThemeByKey(key: string): CityTheme {
  const normalized = key.toLowerCase();
  if (normalized === "highcontrast") return THEMES.highContrast;
  return THEMES[normalized] ?? THEMES.emerald;
}

/** Retrieve a theme key by its index. Fallback to "emerald". */
export function getThemeKeyByIndex(index: number): string {
  const keys = getThemeKeys();
  if (index >= 0 && index < keys.length) {
    return keys[index];
  }
  return "emerald";
}

/** Retrieve a theme object by its index. Fallback to emerald. */
export function getThemeByIndex(index: number): CityTheme {
  const key = getThemeKeyByIndex(index);
  return THEMES[key];
}

/** Get the index of a theme key. Fallback to 0. */
export function getThemeIndexByKey(key: string): number {
  const normalized = key.toLowerCase();
  let searchKey = normalized;
  if (normalized === "highcontrast") searchKey = "highContrast";
  const index = getThemeKeys().indexOf(searchKey);
  return index >= 0 ? index : 0;
}
