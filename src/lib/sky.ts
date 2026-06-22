// Day/night sky + sun model for Git City, driven by San Francisco local time.
//
// - sunPosition(): real-ish solar altitude/azimuth for SF (no deps), so the
//   city looks like whatever time it actually is in SF.
// - samplePalette(): a cinematic, keyframed atmosphere palette interpolated by
//   sun altitude (night -> dawn -> day -> dusk -> night).
// - skyState: a shared, per-frame-interpolated snapshot the renderer reads
//   (the building shader, the sky dome) so everything stays in sync.
//
// All colors are linear-ish RGB triplets in 0..1 (we set them via Color.setRGB).

export type RGB = [number, number, number];

const SF_LAT = 37.7749;
const SF_LON = -122.4194;
const DEG = Math.PI / 180;

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Solar altitude (degrees above horizon) and a world-space direction toward the
 * light for San Francisco. `forceSolarHour` (0..24) overrides the time for
 * previewing (?hour=).
 */
export function sunPosition(date: Date, forceSolarHour?: number): {
  altitudeDeg: number;
  dir: RGB;
} {
  // Day of year
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const n = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000;
  // Solar declination
  const decl = 23.44 * Math.sin(DEG * (360 * (284 + n)) / 365);
  // Local solar time at SF's longitude (good enough for visuals; skips EoT)
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solarTime = forceSolarHour ?? (((utcH + SF_LON / 15) % 24) + 24) % 24;
  const H = (solarTime - 12) * 15; // hour angle, degrees

  const latR = SF_LAT * DEG, declR = decl * DEG, hR = H * DEG;
  const sinAlt = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(hR);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(-Math.sin(hR), Math.tan(declR) * Math.cos(latR) - Math.sin(latR) * Math.cos(hR));

  let dir: RGB;
  if (altitude > 0.02) {
    dir = [Math.cos(altitude) * Math.sin(az), Math.sin(altitude), -Math.cos(altitude) * Math.cos(az)];
  } else {
    // Sun below horizon: a gentle, high moon so faces still get a little shape.
    dir = [0.28, 0.86, 0.42];
  }
  // normalize
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return { altitudeDeg: altitude / DEG, dir: [dir[0] / l, dir[1] / l, dir[2] / l] };
}

export interface Palette {
  skyTop: RGB;
  skyHorizon: RGB;
  bg: RGB;
  sunColor: RGB;
  sunStrength: number;
  ambientColor: RGB;
  ambientStrength: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiStrength: number;
  fogColor: RGB;
  fogNear: number;
  fogFar: number;
  exposure: number;
  nightFactor: number; // 1 = full night (windows glow), 0 = full day
}

interface RawKey {
  alt: number;
  skyTop: string; skyHorizon: string; bg: string;
  sunColor: string; sunStrength: number;
  ambientColor: string; ambientStrength: number;
  hemiSky: string; hemiGround: string; hemiStrength: number;
  fogColor: string; fogNear: number; fogFar: number;
  exposure: number; nightFactor: number;
}

// Cinematic keyframes, ordered by sun altitude (deg). Interpolated between.
const RAW_KEYS: RawKey[] = [
  { // deep night — a *lit* moonlit night, not a black void: a strong cool-blue
    // ambient + hemisphere floor fills the canyons so ground/parks/roads read
    // with real color, while a touch of city-glow teal keeps it from going
    // monochrome. The emissive windows still own the highlights.
    alt: -18,
    skyTop: "#0b1024", skyHorizon: "#23315c", bg: "#1a2546",
    sunColor: "#d6def8", sunStrength: 0.6,
    ambientColor: "#5066a0", ambientStrength: 2.1,
    hemiSky: "#5a78c0", hemiGround: "#1d2a3e", hemiStrength: 2.4,
    fogColor: "#23315c", fogNear: 800, fogFar: 4600, exposure: 1.32, nightFactor: 1.0,
  },
  { // civil twilight (pre-dawn / dusk)
    alt: -6,
    skyTop: "#22315c", skyHorizon: "#6a5684", bg: "#3d3a5e",
    sunColor: "#e8aa86", sunStrength: 0.95,
    ambientColor: "#6e72a0", ambientStrength: 1.7,
    hemiSky: "#6a80b8", hemiGround: "#2a2636", hemiStrength: 2.0,
    fogColor: "#46425f", fogNear: 900, fogFar: 5400, exposure: 1.22, nightFactor: 0.72,
  },
  { // sunrise / sunset at the horizon
    alt: 1,
    skyTop: "#2b4a86", skyHorizon: "#f0925a", bg: "#b9764f",
    sunColor: "#ff9d55", sunStrength: 1.8,
    ambientColor: "#9a7a72", ambientStrength: 1.05,
    hemiSky: "#8a96c0", hemiGround: "#3a2c1e", hemiStrength: 1.1,
    fogColor: "#bc8568", fogNear: 1400, fogFar: 8000, exposure: 1.1, nightFactor: 0.3,
  },
  { // golden morning / afternoon
    alt: 12,
    skyTop: "#3f76c8", skyHorizon: "#d8c29a", bg: "#9fb6d6",
    sunColor: "#ffe6bf", sunStrength: 2.3,
    ambientColor: "#9fb0cc", ambientStrength: 1.2,
    hemiSky: "#bcd6f5", hemiGround: "#5a5142", hemiStrength: 1.5,
    fogColor: "#b6c8de", fogNear: 2000, fogFar: 11000, exposure: 1.18, nightFactor: 0.05,
  },
  { // midday
    alt: 45,
    skyTop: "#3f7fd6", skyHorizon: "#c2dcf2", bg: "#bcd6f0",
    sunColor: "#fff6e8", sunStrength: 2.6,
    ambientColor: "#acc0dc", ambientStrength: 1.35,
    hemiSky: "#cfe2fb", hemiGround: "#6a6150", hemiStrength: 1.9,
    fogColor: "#c2d6ec", fogNear: 2800, fogFar: 13000, exposure: 1.22, nightFactor: 0.0,
  },
];

const KEYS: (Palette & { alt: number })[] = RAW_KEYS.map((k) => ({
  alt: k.alt,
  skyTop: hexToRgb(k.skyTop), skyHorizon: hexToRgb(k.skyHorizon), bg: hexToRgb(k.bg),
  sunColor: hexToRgb(k.sunColor), sunStrength: k.sunStrength,
  ambientColor: hexToRgb(k.ambientColor), ambientStrength: k.ambientStrength,
  hemiSky: hexToRgb(k.hemiSky), hemiGround: hexToRgb(k.hemiGround), hemiStrength: k.hemiStrength,
  fogColor: hexToRgb(k.fogColor), fogNear: k.fogNear, fogFar: k.fogFar,
  exposure: k.exposure, nightFactor: k.nightFactor,
}));

export function samplePalette(altitudeDeg: number): Palette {
  if (altitudeDeg <= KEYS[0].alt) return KEYS[0];
  const last = KEYS[KEYS.length - 1];
  if (altitudeDeg >= last.alt) return last;
  let i = 0;
  while (i < KEYS.length - 1 && altitudeDeg >= KEYS[i + 1].alt) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(a.alt, b.alt, altitudeDeg);
  return {
    skyTop: lerpRgb(a.skyTop, b.skyTop, t),
    skyHorizon: lerpRgb(a.skyHorizon, b.skyHorizon, t),
    bg: lerpRgb(a.bg, b.bg, t),
    sunColor: lerpRgb(a.sunColor, b.sunColor, t),
    sunStrength: lerp(a.sunStrength, b.sunStrength, t),
    ambientColor: lerpRgb(a.ambientColor, b.ambientColor, t),
    ambientStrength: lerp(a.ambientStrength, b.ambientStrength, t),
    hemiSky: lerpRgb(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpRgb(a.hemiGround, b.hemiGround, t),
    hemiStrength: lerp(a.hemiStrength, b.hemiStrength, t),
    fogColor: lerpRgb(a.fogColor, b.fogColor, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    exposure: lerp(a.exposure, b.exposure, t),
    nightFactor: lerp(a.nightFactor, b.nightFactor, t),
  };
}

/**
 * Shared, per-frame-interpolated snapshot of the current sky. SunRig writes it;
 * the building shader and sky dome read it (no React re-renders).
 */
export const skyState = {
  ready: false,
  sunDir: [0.28, 0.86, 0.42] as RGB,
  sunColor: [0.72, 0.77, 0.9] as RGB,
  sunStrength: 0.3,
  ambientColor: [0.16, 0.2, 0.3] as RGB,
  ambientStrength: 0.55,
  hemiSky: [0.1, 0.15, 0.26] as RGB,
  hemiGround: [0.02, 0.03, 0.05] as RGB,
  hemiStrength: 0.6,
  skyTop: [0.02, 0.02, 0.05] as RGB,
  skyHorizon: [0.04, 0.06, 0.14] as RGB,
  nightFactor: 1,
};
