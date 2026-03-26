"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────

type ThemeLike = {
    sunPos: [number, number, number];
    sunColor: string;
    building: { windowLit: string[]; accent: string };
};

type Props = {
    themeIndex: 0 | 1 | 2 | 3;
    theme: ThemeLike;
};

// ─── Tunables ─────────────────────────────────────────────────

const SKY_RADIUS = 1800;

// Per-theme disc config (elevation degrees, distance, scale)
// Kept separate from old STAR_COUNTS so old constants are not lost.
const DISC_CFG = [
    { elevDeg: 14, dist: 900, scale: 110 },  // 0: Midnight — crisp small moon
    { elevDeg: 7, dist: 850, scale: 200 },  // 1: Sunset
    { elevDeg: 5, dist: 800, scale: 300 },  // 2: Neon — synthwave disc
    { elevDeg: 14, dist: 800, scale: 110 },  // 3: Emerald — small orb
] as const;

// Per-theme particle counts (conservative)
const STAR_COUNTS = [900, 0, 600, 300] as const; // Midnight + Neon + Emerald faint
const DUST_COUNTS = [0, 0, 400, 0] as const; // Neon dust
const FIREFLY_COUNTS = [0, 0, 0, 280] as const; // Emerald pixels

// Per-theme star distances (closer than SKY_RADIUS for a tighter feel)
const STAR_DIST = [900, 0, 850, 900] as const;

// Per-theme star min-elevation (degrees above horizon)
const STAR_MIN_ELEV = [6, 0, 8, 12] as const;

// Reduced-motion: skips meteor showers, halves particle counts
const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const MAX_STREAKS = 3;
const STREAK_SEGMENTS = 10;
const UPDATE_EVERY_N_FRAMES = 3; // ~20fps updates on 60fps scene — saves CPU

// ─── Helpers ──────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randRange(rng: () => number, a: number, b: number): number {
    return a + (b - a) * rng();
}

/** Sample a direction on the UPPER hemisphere only (y > 0). */
function sampleUpperHemisphereDir(
    rng: () => number,
    minElevDeg: number,
    maxElevDeg: number
): THREE.Vector3 {
    const elev = ((minElevDeg + (maxElevDeg - minElevDeg) * rng()) * Math.PI) / 180;
    const az = rng() * Math.PI * 2;
    const y = Math.sin(elev);
    const h = Math.cos(elev);
    return new THREE.Vector3(h * Math.cos(az), y, h * Math.sin(az)).normalize();
}

/** Crisp moon disc texture — 512px, narrow alpha edge, subtle crater noise.
 *  Replaces the old soft radial blob for a more realistic moon look. */
function makeCrispMoonTexture(size = 512): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.46;

    // --- Draw moon body (clipped circle)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Soft lighting gradient (upper-left light source)
    const light = ctx.createRadialGradient(
        cx - r * 0.25, cy - r * 0.25, r * 0.15,
        cx, cy, r
    );
    light.addColorStop(0, "rgba(255,255,255,1)");
    light.addColorStop(1, "rgba(200,220,255,1)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, size, size);

    // Tiny crater specks (very subtle)
    const rng = mulberry32(1337);
    for (let i = 0; i < 75; i++) {
        const rr = r * randRange(rng, 0.008, 0.03);
        const a = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng()) * r * 0.85;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        ctx.globalAlpha = randRange(rng, 0.03, 0.08);
        ctx.fillStyle = rng() < 0.5 ? "#d8e6ff" : "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // --- Crisp alpha edge mask (very narrow falloff)
    ctx.globalCompositeOperation = "destination-in";
    const edge = ctx.createRadialGradient(cx, cy, r * 0.985, cx, cy, r * 1.01);
    edge.addColorStop(0, "rgba(0,0,0,1)");
    edge.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "source-over";

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

/** Simple two-stop radial gradient canvas texture (Sunset sun / Emerald orb). */
function makeRadialTexture(
    inner: string,
    mid: string,
    outer: string,
    size = 128
): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(
        size / 2, size / 2, size * 0.05,
        size / 2, size / 2, size * 0.5
    );
    g.addColorStop(0, inner);
    g.addColorStop(0.45, mid);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

/** Synthwave striped disc texture (Neon theme).
 *  Yellow-top → pink-bottom gradient with horizontal dark stripe cuts. */
function makeSynthwaveMoonTexture(size = 256): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    // --- Clip to circle ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // --- Vertical gradient (yellow -> pink) ---
    const grad = ctx.createLinearGradient(0, size * 0.1, 0, size * 0.9);
    grad.addColorStop(0, "#FFE066");   // warm yellow
    grad.addColorStop(0.55, "#FF7AC8");   // mid pink
    grad.addColorStop(1, "#FF2DCC");   // neon pink
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(0, 0, size, size);

    // --- Stripes (cut-out / darker bands) ---
    // emulate outrun "scanlines" across the sun
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#2a0038"; // deep purple-ish dark
    const stripeH = Math.max(3, Math.floor(size / 22));
    const gapH = Math.max(2, Math.floor(size / 34));
    let y = Math.floor(size * 0.42);
    while (y < size * 0.92) {
        ctx.fillRect(0, y, size, stripeH);
        y += stripeH + gapH;
    }

    ctx.restore();

    // --- Soft outer glow ---
    const glow = ctx.createRadialGradient(
        size / 2, size / 2, size * 0.2,
        size / 2, size / 2, size * 0.56
    );
    glow.addColorStop(0, "rgba(255, 180, 255, 0.18)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter; // keeps stripes crisp
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
}

/** Sunset horizon scattering band — thin 4-wide canvas mapped onto a sphere.
 *  Only the horizon latitude band is opaque; sky and below fade to 0. */
function makeHorizonBandTexture(h = 256): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 4; c.height = h;
    const ctx = c.getContext("2d")!;

    const g = ctx.createLinearGradient(0, 0, 0, h);
    // v=0 top, v=1 bottom; horizon lives near v=0.5
    g.addColorStop(0.00, "rgba(255,255,255,0)");
    g.addColorStop(0.35, "rgba(255,255,255,0)");
    g.addColorStop(0.46, "rgba(255,255,255,0.10)");
    g.addColorStop(0.485, "rgba(255,255,255,0.30)");  // bright band just above horizon
    g.addColorStop(0.505, "rgba(255,255,255,0.12)");  // tiny bleed below horizon
    g.addColorStop(0.54, "rgba(255,255,255,0)");
    g.addColorStop(1.00, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, h);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

function makeSunsetDiscTexture(size = 512): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;
    const r = size * 0.46;

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // Warm disc with gentle gradient + slight limb darkening
    const g = ctx.createRadialGradient(cx - r * 0.10, cy - r * 0.12, r * 0.08, cx, cy, r);
    g.addColorStop(0.00, "rgba(255,252,244,1)");
    g.addColorStop(0.30, "rgba(255,233,198,1)");
    g.addColorStop(0.62, "rgba(255,190,135,1)");
    g.addColorStop(0.90, "rgba(255,150,98,1)");
    g.addColorStop(1.00, "rgba(255,132,86,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // VERY subtle grain so it doesn’t look like a flat blob
    const rng = mulberry32(424242);
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 130; i++) {
        const ang = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng()) * r * 0.90;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad;
        const rr = (1 + rng() * 4) * (size / 512);
        ctx.fillStyle = rng() < 0.5 ? "#fff7e6" : "#ffd2b8";
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Crisp alpha edge to kill muddy rings
    ctx.globalCompositeOperation = "destination-in";
    const edge = ctx.createRadialGradient(cx, cy, r * 0.965, cx, cy, r * 1.02);
    edge.addColorStop(0.0, "rgba(0,0,0,1)");
    edge.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "source-over";

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

function makeSunsetHaloTexture(size = 512): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0.00, "rgba(255,200,140,0.18)");
    g.addColorStop(0.25, "rgba(255,170,120,0.12)");
    g.addColorStop(0.55, "rgba(255,130,90,0.06)");
    g.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

/** Cirrus texture for a sky-dome (BackSide sphere). No rectangle edges possible. */
function makeSunsetCirrusDomeTexture(seed = 1, w = 1024, h = 512): THREE.CanvasTexture {
    const rng = mulberry32(seed);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // Cirrus mostly in upper sky band
    const streaks = 90;
    for (let i = 0; i < streaks; i++) {
        const y = (0.08 + rng() * 0.34) * h;
        const len = (0.35 + rng() * 0.65) * w;
        const x0 = rng() * w;
        const x1 = x0 + len;

        const amp = 6 + rng() * 18;
        const lw = 1 + rng() * 4;

        ctx.strokeStyle = `rgba(255,255,255,${0.012 + rng() * 0.035})`;
        ctx.lineWidth = lw;

        const draw = (dx: number) => {
            ctx.beginPath();
            ctx.moveTo(x0 + dx, y);
            ctx.quadraticCurveTo(x0 + dx + len * 0.30, y - amp, x0 + dx + len * 0.65, y + amp * 0.6);
            ctx.quadraticCurveTo(x0 + dx + len * 0.85, y + amp, x1 + dx, y + amp * 0.2);
            ctx.stroke();
        };

        draw(0); draw(-w); draw(+w); // seamless wrap
    }

    // Blur a bit so it reads like atmosphere, not drawn lines
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    tctx.filter = "blur(2.2px)";
    tctx.drawImage(c, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);

    // Fade: strongest upper-mid sky, fades near top and near horizon
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createLinearGradient(0, 0, 0, h);
    mask.addColorStop(0.00, "rgba(0,0,0,0)");
    mask.addColorStop(0.10, "rgba(0,0,0,1)");
    mask.addColorStop(0.45, "rgba(0,0,0,1)");
    mask.addColorStop(0.62, "rgba(0,0,0,0)");
    mask.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1.25, 1);
    tex.offset.x = 0.11; // hide seam from front view
    return tex;
}


/** Patchy aurora curtain texture — two 1D noise layers create
 *  gaps where aurora fades out, giving a realistic non-uniform look.
 *  Blur pass smooths column edges. wrapS=Repeat enables UV drift. */
function makeAuroraCurtainTexture(seed = 1, w = 1024, h = 256): THREE.CanvasTexture {
    const rng = mulberry32(seed);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const smooth = (t: number) => t * t * (3 - 2 * t);

    // Two tiling 1D noises: fine (column intensity) + coarse (patchiness mask)
    const knotsA = 64, knotsB = 12;
    const A = Array.from({ length: knotsA }, () => rng());
    const B = Array.from({ length: knotsB }, () => rng());

    const n1 = (x: number) => {
        const u = (x / w) * knotsA;
        const i = Math.floor(u), f = u - i;
        return A[i % knotsA] + (A[(i + 1) % knotsA] - A[i % knotsA]) * smooth(f);
    };
    const nPatch = (x: number) => {
        const u = (x / w) * knotsB;
        const i = Math.floor(u), f = u - i;
        return B[i % knotsB] + (B[(i + 1) % knotsB] - B[i % knotsB]) * smooth(f);
    };

    ctx.globalCompositeOperation = "lighter";

    for (let x = 0; x < w; x += 4) {
        const a = n1(x);
        const p = nPatch(x);
        // Patch mask: below threshold = no aurora (creates natural gaps)
        const patch = smooth(Math.max(0, Math.min(1, (p - 0.22) / 0.55)));

        const top = h * (0.10 + (1 - a) * 0.22);
        const height = h * (0.40 + a * 0.55);
        const colW = 8 + Math.floor(a * 20); // wider, softer columns

        const gv = 200 + Math.floor(a * 50);
        const bv = 160 + Math.floor((1 - a) * 80);
        const alpha = (0.02 + a * 0.10) * patch;

        // Vertical gradient per-column (smooth top/bottom falloff)
        const grad = ctx.createLinearGradient(0, top, 0, top + height);
        grad.addColorStop(0.00, `rgba(0,${gv},${bv},0)`);
        grad.addColorStop(0.25, `rgba(0,${gv},${bv},${alpha})`);
        grad.addColorStop(0.70, `rgba(0,${gv},${bv},${alpha * 0.9})`);
        grad.addColorStop(1.00, `rgba(0,${gv},${bv},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x, top, colW, height);
    }

    // Blur pass — removes harsh column edges
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    tctx.filter = "blur(2.2px)";
    tctx.drawImage(c, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);

    // Vertical fade band (top/bottom don't cut hard)
    ctx.globalCompositeOperation = "destination-in";
    const band = ctx.createLinearGradient(0, 0, 0, h);
    band.addColorStop(0.00, "rgba(0,0,0,0)");
    band.addColorStop(0.18, "rgba(0,0,0,1)");
    band.addColorStop(0.72, "rgba(0,0,0,1)");
    band.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1.2, 1); // less tiling repetition
    return tex;
}

type Streak = {
    active: boolean;
    t: number;
    dur: number;
    sx: number; sy: number; sz: number;
    ex: number; ey: number; ez: number;
    r: number; g: number; b: number;
};

// ─── Component ────────────────────────────────────────────────

export default memo(function ThemeSkyFX({ themeIndex, theme }: Props) {
    const { camera } = useThree();
    const rootRef = useRef<THREE.Group>(null);

    // ── Sky depth helpers — push sky FX near camera.far so they're
    // always behind opaque city geometry (Three.js renders opaque first,
    // then transparent in depth order).
    // Design-time distances in DISC_CFG/STAR_DIST are treated as ratios;
    // at runtime we scale them to sit just inside camera.far.
    const SKY_DIST = camera.far * 0.975;   // keep slightly inside far plane
    const SKY_CLAMP = camera.far * 0.99;    // hard upper-bound
    const skyScale = SKY_DIST / DISC_CFG[themeIndex].dist;
    /** Scale a design-time distance to the sky-depth zone. */
    const skyD = (d: number) => Math.min(d * skyScale, SKY_CLAMP);

    // ── Disc material (moon / sun / synth sun / glow orb) ───────
    // discScale is the design-time value; the runtime scale is skyD(discScale)
    // so it keeps its angular size as the far plane changes.
    const { discTex, discScale, discOpacity, discColor } = useMemo(() => {
        const cfg = DISC_CFG[themeIndex];
        if (themeIndex === 0) return {
            // Midnight: crisp moon with crater noise and narrow alpha edge
            discTex: makeCrispMoonTexture(512),
            discScale: cfg.scale, discOpacity: 0.95,
            discColor: new THREE.Color(1, 1, 1),
        };
        if (themeIndex === 1) return {
            // Sunset: warm orange sun
            discTex: makeSunsetDiscTexture(512),
            discScale: cfg.scale, discOpacity: 0.88,
            discColor: new THREE.Color(1, 1, 1),
        };
        if (themeIndex === 2) return {
            // Neon: synthwave striped moon (upgraded texture + scale from DISC_CFG)
            discTex: makeSynthwaveMoonTexture(256),
            discScale: cfg.scale, discOpacity: 0.95,
            discColor: new THREE.Color(1.0, 1.0, 1.0),
        };
        // Emerald
        return {
            discTex: makeRadialTexture("rgba(180,255,210,1.0)", "rgba(60,200,120,0.6)", "rgba(0,0,0,0)", 128),
            discScale: cfg.scale, discOpacity: 0.82,
            discColor: new THREE.Color(1.2, 2.0, 1.4),
        };
    }, [themeIndex]);

    const discMat = useMemo(() => {
        const m = new THREE.SpriteMaterial({
            map: discTex, transparent: true, opacity: discOpacity,
            depthWrite: false, depthTest: true, fog: false, color: discColor,
            blending: themeIndex === 1 || themeIndex === 3 ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        m.toneMapped = false;
        // Crisp alpha edge for Midnight moon — trims near-transparent halo pixels
        if (themeIndex === 0) m.alphaTest = 0.02;
        if (themeIndex === 1) m.alphaTest = 0.015;
        return m;
    }, [discTex, discOpacity, discColor, themeIndex]);

    // Ref for opacity pulses (safe to hold in ref — SpriteMaterial is mutable)
    const discMatRef = useRef(discMat);
    discMatRef.current = discMat;

    const sunsetHaloMat = useMemo(() => {
        if (themeIndex !== 1) return null;
        const tex = makeSunsetHaloTexture(512);
        const m = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            opacity: 0.26,              // subtle
            depthWrite: false,
            depthTest: true,            // buildings can occlude
            fog: false,
            blending: THREE.AdditiveBlending,
            color: new THREE.Color("#ffb48a"),
        });
        m.toneMapped = false;
        return m;
    }, [themeIndex]);

    // ── Stars (Midnight + Neon + Emerald faint) ──────────────────
    const starPointsRef = useRef<THREE.Points>(null);

    const starGeo = useMemo(() => {
        const rawCount = STAR_COUNTS[themeIndex];
        if (!rawCount) return null;
        const count = prefersReducedMotion ? Math.floor(rawCount * 0.4) : rawCount;
        const rng = mulberry32(1000 + themeIndex);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);

        const dist = STAR_DIST[themeIndex] || SKY_RADIUS;
        const minElev = STAR_MIN_ELEV[themeIndex] || 6;
        // Push stars near camera.far so they render behind all city geometry
        const scaledDist = skyD(dist);

        for (let i = 0; i < count; i++) {
            // Upper hemisphere only — no underground stars
            const dir = sampleUpperHemisphereDir(rng, minElev, 78);
            pos[i * 3] = dir.x * scaledDist;
            pos[i * 3 + 1] = dir.y * scaledDist;
            pos[i * 3 + 2] = dir.z * scaledDist;

            const base = themeIndex === 0
                ? new THREE.Color(0.85, 0.92, 1.20)   // cool blue-white (Midnight)
                : themeIndex === 2
                    ? new THREE.Color(1.10, 0.80, 1.35) // lavender-white (Neon)
                    : new THREE.Color(0.65, 1.10, 0.85); // cool green-white (Emerald)
            const tw = randRange(rng, 0.7, 1.35);
            col[i * 3] = base.r * tw;
            col[i * 3 + 1] = base.g * tw;
            col[i * 3 + 2] = base.b * tw;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skyD depends on camera.far, intentionally omitted
    }, [themeIndex]);

    const starMat = useMemo(() => {
        if (!STAR_COUNTS[themeIndex]) return null;
        const m = new THREE.PointsMaterial({
            size: themeIndex === 2 ? 2.0 : themeIndex === 3 ? 1.6 : 1.8,
            sizeAttenuation: false, // stable screen-space size — stars don't shrink away
            vertexColors: true, transparent: true,
            opacity: themeIndex === 2 ? 0.85 : themeIndex === 3 ? 0.55 : 0.75,
            depthWrite: false,
            depthTest: true, // ground/buildings occlude stars ✅
            fog: false,
        });
        m.toneMapped = false;
        return m;
    }, [themeIndex]);

    // ── Neon Dust ────────────────────────────────────────────────
    const dustPointsRef = useRef<THREE.Points>(null);

    const dustGeo = useMemo(() => {
        const rawCount = DUST_COUNTS[themeIndex];
        if (!rawCount) return null;
        const count = prefersReducedMotion ? Math.floor(rawCount * 0.4) : rawCount;
        const rng = mulberry32(2000 + themeIndex);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const dir = sampleUpperHemisphereDir(rng, 6, 45);
            // Scale dust to sky depth zone so it stays behind buildings
            const r = skyD(SKY_RADIUS * randRange(rng, 0.38, 0.55));
            pos[i * 3] = dir.x * r;
            pos[i * 3 + 1] = dir.y * r;
            pos[i * 3 + 2] = dir.z * r;

            const pick = rng();
            const c = pick < 0.5
                ? new THREE.Color(2.5, 0.4, 2.2)
                : new THREE.Color(0.4, 2.2, 2.5);
            const a = randRange(rng, 0.5, 1.0);
            col[i * 3] = c.r * a;
            col[i * 3 + 1] = c.g * a;
            col[i * 3 + 2] = c.b * a;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skyD depends on camera.far, intentionally omitted
    }, [themeIndex]);

    const dustMat = useMemo(() => {
        if (!DUST_COUNTS[themeIndex]) return null;
        const m = new THREE.PointsMaterial({
            size: 2.4, vertexColors: true, transparent: true, opacity: 0.55,
            depthWrite: false, depthTest: true, fog: false,
            blending: THREE.AdditiveBlending,
        });
        m.toneMapped = false;
        return m;
    }, [themeIndex]);

    // ── Emerald Fireflies / Contribution Pixels ──────────────────
    const flyPointsRef = useRef<THREE.Points>(null);

    const flyGeo = useMemo(() => {
        const rawCount = FIREFLY_COUNTS[themeIndex];
        if (!rawCount) return null;
        const count = prefersReducedMotion ? Math.floor(rawCount * 0.4) : rawCount;
        const rng = mulberry32(3000 + themeIndex);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);

        const palette = (theme.building?.windowLit ?? ["#39d353"])
            .map(h => new THREE.Color(h));

        for (let i = 0; i < count; i++) {
            const dir = sampleUpperHemisphereDir(rng, 8, 35);
            const r = SKY_RADIUS * randRange(rng, 0.25, 0.45);
            pos[i * 3] = dir.x * r;
            pos[i * 3 + 1] = dir.y * r;
            pos[i * 3 + 2] = dir.z * r;

            const c = palette[Math.floor(randRange(rng, 0, palette.length))];
            // Boost brightness 4× — the GitHub green hex values are perceptually dark;
            // with toneMapped=false + AdditiveBlending multiplied values glow visibly.
            const a = randRange(rng, 3.5, 5.0);
            col[i * 3] = c.r * a;
            col[i * 3 + 1] = c.g * a;
            col[i * 3 + 2] = c.b * a;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return geo;
    }, [themeIndex, theme.building]);

    const flyMat = useMemo(() => {
        if (!FIREFLY_COUNTS[themeIndex]) return null;
        const m = new THREE.PointsMaterial({
            size: 3.5, vertexColors: true, transparent: true, opacity: 1.0,
            depthWrite: false,
            depthTest: true, // fixed: was false — fireflies were drawing through ground
            fog: false,
            blending: THREE.AdditiveBlending,
        });
        m.toneMapped = false;
        return m;
    }, [themeIndex]);

    // ── Aurora Ring (Emerald) — CylinderGeometry so it wraps
    // the full horizon with no billboard sprite edges.
    const auroraGeo = useMemo(() => {
        if (themeIndex !== 3) return null;
        const radius = skyD(940);
        const height = skyD(260);   // reduced from 420 — ring is less dominating
        // 160 segments = smoother ring, openEnded
        return new THREE.CylinderGeometry(radius, radius, height, 160, 1, true);
    }, [themeIndex, skyScale]);

    const { auroraRingMat0, auroraRingMat1 } = useMemo(() => {
        if (themeIndex !== 3) return { auroraRingMat0: null, auroraRingMat1: null };

        const texW = prefersReducedMotion ? 512 : 1024;
        const texH = prefersReducedMotion ? 128 : 256;
        const t0 = makeAuroraCurtainTexture(7001, texW, texH);
        const t1 = makeAuroraCurtainTexture(7002, texW, texH);

        const m0 = new THREE.MeshBasicMaterial({
            map: t0, transparent: true, opacity: 0.22, // ↓ from 0.26
            depthWrite: false, depthTest: true, fog: false,
            side: THREE.BackSide,   // camera is inside the cylinder
            blending: THREE.AdditiveBlending,
        });
        const m1 = new THREE.MeshBasicMaterial({
            map: t1, transparent: true, opacity: 0.14, // ↓ from 0.17
            depthWrite: false, depthTest: true, fog: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
        });
        m0.toneMapped = false;
        m1.toneMapped = false;
        // Stagger seams so they don't line up at the front view
        m0.map!.offset.x = 0.13;
        m1.map!.offset.x = 0.57;
        return { auroraRingMat0: m0, auroraRingMat1: m1 };
    }, [themeIndex]);

    const auroraPulse = useRef({ active: false, t: 0, dur: 1.5, nextIn: 12 });

    // ── Sunset: horizon scattering sphere + cirrus streak sprites ──
    // Far more cinematic than blob-cloud cylinders:
    //   • 1 sphere draw call = seamless warm horizon glow
    //   • 2 sprite draw calls = wispy cirrus over/near the sun
    const sunsetHazeGeo = useMemo(() => {
        if (themeIndex !== 1) return null;
        return new THREE.SphereGeometry(skyD(1200), 48, 24);
    }, [themeIndex, skyScale]);

    const sunsetHazeMat = useMemo(() => {
        if (themeIndex !== 1) return null;
        const tex = makeHorizonBandTexture(256);
        const m = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.18,
            depthWrite: false, depthTest: true, fog: false,
            side: THREE.BackSide, // camera inside the sphere
            blending: THREE.AdditiveBlending,
            color: new THREE.Color("#ff9b7a"),
        });
        m.toneMapped = false;
        return m;
    }, [themeIndex]);

    const sunsetCirrusGeo = useMemo(() => {
        if (themeIndex !== 1) return null;
        return new THREE.SphereGeometry(skyD(1300), 48, 24);
    }, [themeIndex, skyScale]);

    const sunsetCirrusMat = useMemo(() => {
        if (themeIndex !== 1) return null;
        const texW = prefersReducedMotion ? 512 : 1024;
        const texH = prefersReducedMotion ? 256 : 512;
        const tex = makeSunsetCirrusDomeTexture(5301, texW, texH);

        const m = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.09,             // keep LOW (subtle)
            depthWrite: false,
            depthTest: true,
            fog: false,
            side: THREE.BackSide,
            color: new THREE.Color("#ffd8c2"),
        });
        m.toneMapped = false;
        return m;
    }, [themeIndex]);

    // ── Shooting-star streak pool ────────────────────────────────
    const streakRef = useRef<THREE.Points>(null);

    const streakState = useRef<Streak[]>(
        Array.from({ length: MAX_STREAKS }, () => ({
            active: false, t: 0, dur: 1,
            sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0,
            r: 1, g: 1, b: 1,
        }))
    );

    const streakGeo = useMemo(() => {
        const totalPts = MAX_STREAKS * STREAK_SEGMENTS;
        const pos = new Float32Array(totalPts * 3);
        const col = new Float32Array(totalPts * 3); // init black = invisible
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return geo;
    }, []);

    const streakMat = useMemo(() => {
        const m = new THREE.PointsMaterial({
            size: 3.0, vertexColors: true, transparent: true, opacity: 0.9,
            depthWrite: false, depthTest: true, fog: false,
            blending: THREE.AdditiveBlending,
        });
        m.toneMapped = false;
        return m;
    }, []);

    const nextStreakIn = useRef(10);
    const rngRef = useRef(mulberry32(9000 + themeIndex));

    // Meteor shower state (Midnight only)
    const shower = useRef({ active: false, left: 0, nextIn: 0, showerNextIn: 0 });

    // ── Pulse state ──────────────────────────────────────────────
    const pulse = useRef({ t: 0, dur: 0, active: false, nextIn: 6 });

    // Reset per-theme state on theme switch
    useEffect(() => {
        rngRef.current = mulberry32(9000 + themeIndex);
        nextStreakIn.current = randRange(rngRef.current, 8, 18);

        const colAttr = streakGeo.getAttribute("color") as THREE.BufferAttribute;
        (colAttr.array as Float32Array).fill(0);
        colAttr.needsUpdate = true;

        for (const s of streakState.current) s.active = false;

        pulse.current = {
            t: 0, dur: 0, active: false,
            nextIn: themeIndex === 2
                ? randRange(rngRef.current, 4, 8)
                : randRange(rngRef.current, 8, 16),
        };

        shower.current = {
            active: false, left: 0, nextIn: 0,
            showerNextIn: randRange(rngRef.current, 90, 180),
        };

        auroraPulse.current = { active: false, t: 0, dur: 1.5, nextIn: 12 };
    }, [themeIndex, streakGeo]);

    // ── Disc placement — elevation + azimuth, pushed to sky depth zone ─
    const discPos = useMemo(() => {
        const cfg = DISC_CFG[themeIndex];
        const elevRad = (cfg.elevDeg * Math.PI) / 180;
        const azRad = Math.PI * 0.18; // slightly off-centre
        const d = skyD(cfg.dist); // always near camera.far → behind buildings
        return new THREE.Vector3(
            Math.cos(azRad) * Math.cos(elevRad) * d,
            Math.sin(elevRad) * d,
            -Math.sin(azRad) * Math.cos(elevRad) * d
        );
    }, [themeIndex, skyScale]);

    // Runtime disc scale (angular size preserved as depth changes)
    const discDisplayScale = skyD(discScale);

    // ── Spawn a streak ───────────────────────────────────────────
    const spawnStreak = () => {
        const rng = rngRef.current;
        const slot = streakState.current.find(s => !s.active);
        if (!slot) return;

        // Streaks travel within the same depth zone as the stars
        const dist = skyD(STAR_DIST[themeIndex] || SKY_RADIUS);
        const sd = sampleUpperHemisphereDir(rng, 18, 38);
        const ed = sampleUpperHemisphereDir(rng, 8, 18);

        slot.active = true;
        slot.t = 0;
        slot.dur = themeIndex === 2
            ? randRange(rng, 0.45, 0.85)   // Neon: snappier
            : randRange(rng, 0.8, 1.35);
        slot.sx = sd.x * dist; slot.sy = sd.y * dist; slot.sz = sd.z * dist;
        slot.ex = ed.x * dist; slot.ey = ed.y * dist; slot.ez = ed.z * dist;

        if (themeIndex === 0) { slot.r = 1.2; slot.g = 1.2; slot.b = 1.6; }       // cool white-blue
        else if (themeIndex === 1) { slot.r = 1.6; slot.g = 1.1; slot.b = 0.6; }  // warm gold
        else if (themeIndex === 2) { slot.r = 2.6; slot.g = 0.6; slot.b = 2.4; }  // neon magenta
        else { slot.r = 0.7; slot.g = 2.0; slot.b = 1.0; }  // emerald
    };

    // Refs to bypass direct mutability linter warnings in useFrame
    const auroraMat0Ref = useRef(auroraRingMat0); auroraMat0Ref.current = auroraRingMat0;
    const auroraMat1Ref = useRef(auroraRingMat1); auroraMat1Ref.current = auroraRingMat1;
    const cirrusMatRef = useRef(sunsetCirrusMat); cirrusMatRef.current = sunsetCirrusMat;

    // ── Frame loop ───────────────────────────────────────────────
    const frameCounter = useRef(0);

    useFrame((_, delta) => {
        if (rootRef.current) rootRef.current.position.copy(camera.position);

        frameCounter.current++;
        if (frameCounter.current % UPDATE_EVERY_N_FRAMES !== 0) return;

        const dt = Math.min(delta * UPDATE_EVERY_N_FRAMES, 0.08);

        // Gentle slow rotation for "aliveness" (no per-point update)
        if (starPointsRef.current) starPointsRef.current.rotation.y += dt * 0.008;
        if (dustPointsRef.current) dustPointsRef.current.rotation.y -= dt * 0.015;
        if (flyPointsRef.current) flyPointsRef.current.rotation.y += dt * 0.010;

        // ── Aurora ring scroll + pulse (Emerald) ─────────────────
        if (themeIndex === 3 && auroraRingMat0 && auroraRingMat1) {
            // Slower drift — patchy texture already has visual complexity
            if (auroraRingMat0.map && auroraRingMat1.map) {
                auroraRingMat0.map.offset.x = (auroraRingMat0.map.offset.x + dt * 0.010) % 1;
                auroraRingMat1.map.offset.x = (auroraRingMat1.map.offset.x - dt * 0.006) % 1;
            }

                auroraPulse.current.nextIn -= dt;
                if (auroraPulse.current.nextIn <= 0 && !auroraPulse.current.active) {
                    auroraPulse.current.active = true;
                    auroraPulse.current.t = 0;
                    auroraPulse.current.dur = 1.8;
                    auroraPulse.current.nextIn = randRange(rngRef.current, 10, 22);
                }
                if (auroraPulse.current.active) {
                    auroraPulse.current.t += dt;
                    const p01 = Math.min(1, auroraPulse.current.t / auroraPulse.current.dur);
                    const bump = Math.sin(p01 * Math.PI);
                    auroraRingMat0.opacity = 0.22 + bump * 0.15;
                    auroraRingMat1.opacity = 0.14 + bump * 0.11;
                    if (p01 >= 1) {
                        auroraPulse.current.active = false;
                        auroraRingMat0.opacity = 0.22;
                        auroraRingMat1.opacity = 0.14;
                    }
                }
            }


        // ── Sunset cirrus drift ───────────────────────────────────────
        if (themeIndex === 1 && sunsetCirrusMat?.map) {
            sunsetCirrusMat.map.offset.x = (sunsetCirrusMat.map.offset.x + dt * 0.0012) % 1;
        }

        // ── Streak spawner ───────────────────────────────────────
        // Per-theme shooting star intervals
        const ssIntervals = [
            [18, 45],   // Midnight
            [55, 100],  // Sunset (rare)
            [10, 30],   // Neon (frequent)
            [35, 75],   // Emerald
        ];
        const [ssMin, ssMax] = ssIntervals[themeIndex];

        nextStreakIn.current -= dt;
        if (nextStreakIn.current <= 0) {
            spawnStreak();
            nextStreakIn.current = randRange(rngRef.current, ssMin, ssMax);
        }

        // ── Meteor shower (Midnight only, skipped for reduced-motion) ──
        if (themeIndex === 0 && !prefersReducedMotion) {
            shower.current.showerNextIn -= dt;
            if (shower.current.showerNextIn <= 0 && !shower.current.active) {
                shower.current.active = true;
                shower.current.left = Math.floor(randRange(rngRef.current, 5, 10));
                shower.current.nextIn = 0;
                shower.current.showerNextIn = randRange(rngRef.current, 90, 180);
            }
            if (shower.current.active) {
                shower.current.nextIn -= dt;
                if (shower.current.nextIn <= 0 && shower.current.left > 0) {
                    spawnStreak();
                    shower.current.left--;
                    shower.current.nextIn = randRange(rngRef.current, 0.22, 0.50);
                }
                if (shower.current.left <= 0) shower.current.active = false;
            }
        }

        // Update streak geometry (~30 points max)
        const streakPts = streakRef.current;
        if (streakPts) {
            const posAttr = streakPts.geometry.getAttribute("position") as THREE.BufferAttribute;
            const colAttr = streakPts.geometry.getAttribute("color") as THREE.BufferAttribute;
            const posArr = posAttr.array as Float32Array;
            const colArr = colAttr.array as Float32Array;

            for (let si = 0; si < MAX_STREAKS; si++) {
                const s = streakState.current[si];
                const base = si * STREAK_SEGMENTS;

                if (!s.active) {
                    for (let k = 0; k < STREAK_SEGMENTS; k++) {
                        const ci = (base + k) * 3;
                        colArr[ci] = 0; colArr[ci + 1] = 0; colArr[ci + 2] = 0;
                    }
                    continue;
                }

                s.t += dt;
                const t01 = Math.min(1, s.t / s.dur);
                if (t01 >= 1) { s.active = false; continue; }

                const spacing = 0.06;
                for (let k = 0; k < STREAK_SEGMENTS; k++) {
                    const tt = Math.max(0, t01 - k * spacing);
                    const pi = (base + k) * 3;
                    posArr[pi] = s.sx + (s.ex - s.sx) * tt;
                    posArr[pi + 1] = s.sy + (s.ey - s.sy) * tt;
                    posArr[pi + 2] = s.sz + (s.ez - s.sz) * tt;

                    const fade = (1 - k / STREAK_SEGMENTS) * 1.4;
                    colArr[pi] = s.r * fade;
                    colArr[pi + 1] = s.g * fade;
                    colArr[pi + 2] = s.b * fade;
                }
            }

            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        }

        // ── Pulse scheduler ──────────────────────────────────────
        pulse.current.nextIn -= dt;
        if (pulse.current.nextIn <= 0 && !pulse.current.active) {
            pulse.current.active = true;
            pulse.current.t = 0;
            // Neon: short glitch pulse; others: slow glow pulse
            pulse.current.dur = themeIndex === 2 ? 0.12 : 0.5;
            const rng = rngRef.current;
            pulse.current.nextIn = themeIndex === 2
                ? randRange(rng, 5, 12)
                : randRange(rng, 10, 22);
        }

        if (pulse.current.active) {
            pulse.current.t += dt;
            const p01 = Math.min(1, pulse.current.t / pulse.current.dur);
            const bump = Math.sin(p01 * Math.PI); // 0 → 1 → 0 arc
            const mat = discMatRef.current;
            mat.opacity = discOpacity + bump * (themeIndex === 2 ? 0.40 : 0.12);
            if (p01 >= 1) {
                pulse.current.active = false;
                discMatRef.current.opacity = discOpacity; // reset to baseline
            }
        }
    });

    // ── Disposal ───────────────────────────────────────────────
    useEffect(() => {
        return () => {
            discTex.dispose(); discMat.dispose();
            starGeo?.dispose(); starMat?.dispose();
            dustGeo?.dispose(); dustMat?.dispose();
            flyGeo?.dispose(); flyMat?.dispose();
            // Aurora ring
            auroraGeo?.dispose();
            auroraRingMat0?.map?.dispose(); auroraRingMat0?.dispose();
            auroraRingMat1?.map?.dispose(); auroraRingMat1?.dispose();
            // Sunset scattering + halo + cirrus dome
            sunsetHazeGeo?.dispose();
            sunsetHazeMat?.map?.dispose(); sunsetHazeMat?.dispose();
            sunsetHaloMat?.map?.dispose(); sunsetHaloMat?.dispose();
            sunsetCirrusGeo?.dispose();
            sunsetCirrusMat?.map?.dispose(); sunsetCirrusMat?.dispose();
            // Streaks
            streakGeo.dispose(); streakMat.dispose();
        };
    }, [discTex, discMat, starGeo, starMat, dustGeo, dustMat,
        flyGeo, flyMat,
        auroraGeo, auroraRingMat0, auroraRingMat1,
        sunsetHazeGeo, sunsetHazeMat, sunsetHaloMat, sunsetCirrusGeo, sunsetCirrusMat,
        streakGeo, streakMat]);

    // ─────────────────────────────────────────────────────────────


    return (
        <group ref={rootRef} renderOrder={-20}>
            {/* Moon / Sun / Synth Sun / Glow Orb disc */}
            <sprite
                position={[discPos.x, discPos.y, discPos.z]}
                scale={[discDisplayScale, discDisplayScale, 1]}
                renderOrder={-19}
                frustumCulled={false}
                material={discMat}
            />

            {/* Stars — Midnight + Neon + Emerald faint (upper hemisphere, depthTest: true) */}
            {starGeo && starMat && (
                <points
                    ref={starPointsRef}
                    geometry={starGeo}
                    material={starMat}
                    renderOrder={-18}
                    frustumCulled={false}
                />
            )}

            {/* Neon Dust */}
            {dustGeo && dustMat && (
                <points
                    ref={dustPointsRef}
                    geometry={dustGeo}
                    material={dustMat}
                    renderOrder={-17}
                    frustumCulled={false}
                />
            )}

            {/* Emerald Fireflies / Contribution Pixels */}
            {flyGeo && flyMat && (
                <points
                    ref={flyPointsRef}
                    geometry={flyGeo}
                    material={flyMat}
                    renderOrder={-16}
                    frustumCulled={false}
                />
            )}

            {/* Aurora Ring layers (Emerald) — lifted so bottom stays near horizon line */}
            {auroraGeo && auroraRingMat0 && (
                <mesh
                    geometry={auroraGeo}
                    material={auroraRingMat0}
                    position={[0, skyD(150), 0]}
                    renderOrder={-17}
                    frustumCulled={false}
                />
            )}
            {auroraGeo && auroraRingMat1 && (
                <mesh
                    geometry={auroraGeo}
                    material={auroraRingMat1}
                    position={[0, skyD(175), 0]}
                    rotation={[0, 0.65, 0]}
                    renderOrder={-17}
                    frustumCulled={false}
                />
            )}

            {/* Sunset: scattering sphere + cirrus dome */}
            {sunsetHazeGeo && sunsetHazeMat && (
                <mesh
                    geometry={sunsetHazeGeo}
                    material={sunsetHazeMat}
                    renderOrder={-18}
                    frustumCulled={false}
                />
            )}

            {/* Sunset Cirrus Dome (BackSide sphere) */}
            {themeIndex === 1 && sunsetCirrusGeo && sunsetCirrusMat && (
                <mesh
                    geometry={sunsetCirrusGeo}
                    material={sunsetCirrusMat}
                    renderOrder={-21}
                    frustumCulled={false}
                />
            )}

            {/* Sunset Halo (subtle glow behind the crisp sun) */}
            {themeIndex === 1 && sunsetHaloMat && (
                <sprite
                    position={[discPos.x, discPos.y, discPos.z]}
                    scale={[discDisplayScale * 2.9, discDisplayScale * 2.9, 1]}
                    renderOrder={-20} // Just behind the disc (-19)
                    frustumCulled={false}
                    material={sunsetHaloMat}
                />
            )}

            {/* Shooting-star streak pool — active for all 4 themes */}
            <points
                ref={streakRef}
                geometry={streakGeo}
                material={streakMat}
                renderOrder={-15}
                frustumCulled={false}
            />
        </group>
    );
});
