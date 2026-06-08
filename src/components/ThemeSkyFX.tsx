"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CityTheme } from "@/config/themes";

// ─── Types ────────────────────────────────────────────────────

type Props = {
    theme: CityTheme;
};

// ─── Tunables ─────────────────────────────────────────────────

const SKY_RADIUS = 1800;

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

export default memo(function ThemeSkyFX({ theme }: Props) {
    const { camera } = useThree();
    const rootRef = useRef<THREE.Group>(null);

    const fx = theme.skyFX;

    // ── Sky depth helpers
    const SKY_DIST = camera.far * 0.975;   // keep slightly inside far plane
    const SKY_CLAMP = camera.far * 0.99;    // hard upper-bound
    const skyScale = SKY_DIST / fx.disc.dist;
    /** Scale a design-time distance to the sky-depth zone. */
    const skyD = (d: number) => Math.min(d * skyScale, SKY_CLAMP);

    // ── Disc material (moon / sun / synth sun / glow orb) ───────
    const { discTex, discScale, discOpacity, discColor } = useMemo(() => {
        const cfg = fx.disc;
        let tex: THREE.CanvasTexture;
        let color = new THREE.Color(cfg.color ?? "#ffffff");

        if (cfg.type === "moon") {
            tex = makeCrispMoonTexture(512);
        } else if (cfg.type === "sun") {
            tex = makeSunsetDiscTexture(512);
        } else if (cfg.type === "synth") {
            tex = makeSynthwaveMoonTexture(256);
        } else if (cfg.type === "radial") {
            const innerColor = cfg.color ?? "rgba(180,255,210,1.0)";
            const midColor = innerColor.replace("1.0)", "0.6)").replace("0.8)", "0.5)");
            tex = makeRadialTexture(innerColor, midColor, "rgba(0,0,0,0)", 128);
            if (cfg.color) {
                // If custom color is passed, boost/scale Three Color values
                color = new THREE.Color(cfg.color);
                color.multiplyScalar(1.5);
            }
        } else {
            // "none" or default
            tex = makeRadialTexture("rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", 16);
        }

        return {
            discTex: tex,
            discScale: cfg.scale,
            discOpacity: cfg.opacity ?? 0.95,
            discColor: color,
        };
    }, [fx.disc]);

    const discMat = useMemo(() => {
        const m = new THREE.SpriteMaterial({
            map: discTex, transparent: true, opacity: discOpacity,
            depthWrite: false, depthTest: true, fog: false, color: discColor,
            blending: fx.disc.type === "sun" || fx.disc.type === "radial" ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        m.toneMapped = false;
        if (fx.disc.type === "moon") m.alphaTest = 0.02;
        if (fx.disc.type === "sun") m.alphaTest = 0.015;
        return m;
    }, [discTex, discOpacity, discColor, fx.disc.type]);

    const discMatRef = useRef(discMat);
    discMatRef.current = discMat;

    const sunsetHaloMat = useMemo(() => {
        if (!fx.sunsetHaze) return null;
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
    }, [fx.sunsetHaze]);

    // ── Stars ──────────────────
    const starPointsRef = useRef<THREE.Points>(null);

    const starGeo = useMemo(() => {
        const rawCount = fx.stars?.count ?? 0;
        if (!rawCount) return null;
        const count = prefersReducedMotion ? Math.floor(rawCount * 0.4) : rawCount;
        const rng = mulberry32(1000 + (fx.stars?.count ?? 100));
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);

        const dist = fx.stars?.dist || SKY_RADIUS;
        const minElev = fx.stars?.minElev || 6;
        const scaledDist = skyD(dist);

        const starColorBase = fx.stars?.color ? new THREE.Color(
            fx.stars.color[0],
            fx.stars.color[1],
            fx.stars.color[2]
        ) : new THREE.Color(0.85, 0.92, 1.20);

        for (let i = 0; i < count; i++) {
            const dir = sampleUpperHemisphereDir(rng, minElev, 78);
            pos[i * 3] = dir.x * scaledDist;
            pos[i * 3 + 1] = dir.y * scaledDist;
            pos[i * 3 + 2] = dir.z * scaledDist;

            const tw = randRange(rng, 0.7, 1.35);
            col[i * 3] = starColorBase.r * tw;
            col[i * 3 + 1] = starColorBase.g * tw;
            col[i * 3 + 2] = starColorBase.b * tw;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skyD depends on camera.far, intentionally omitted
    }, [fx.stars]);

    const starMat = useMemo(() => {
        if (!fx.stars?.count) return null;
        const m = new THREE.PointsMaterial({
            size: fx.stars.count < 500 ? 1.6 : 1.8,
            sizeAttenuation: false,
            vertexColors: true, transparent: true,
            opacity: 0.75,
            depthWrite: false,
            depthTest: true,
            fog: false,
        });
        m.toneMapped = false;
        return m;
    }, [fx.stars]);

    // ── Dust ────────────────────────────────────────────────
    const dustPointsRef = useRef<THREE.Points>(null);

    const dustGeo = useMemo(() => {
        const rawCount = fx.dust?.count ?? 0;
        if (!rawCount) return null;
        const count = prefersReducedMotion ? Math.floor(rawCount * 0.4) : rawCount;
        const rng = mulberry32(2000 + rawCount);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);

        const dCol1 = fx.dust?.color1 ? new THREE.Color(fx.dust.color1[0], fx.dust.color1[1], fx.dust.color1[2]) : new THREE.Color(2.5, 0.4, 2.2);
        const dCol2 = fx.dust?.color2 ? new THREE.Color(fx.dust.color2[0], fx.dust.color2[1], fx.dust.color2[2]) : new THREE.Color(0.4, 2.2, 2.5);

        for (let i = 0; i < count; i++) {
            const dir = sampleUpperHemisphereDir(rng, 6, 45);
            const r = skyD(SKY_RADIUS * randRange(rng, 0.38, 0.55));
            pos[i * 3] = dir.x * r;
            pos[i * 3 + 1] = dir.y * r;
            pos[i * 3 + 2] = dir.z * r;

            const pick = rng();
            const c = pick < 0.5 ? dCol1 : dCol2;
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
    }, [fx.dust]);

    const dustMat = useMemo(() => {
        if (!fx.dust?.count) return null;
        const m = new THREE.PointsMaterial({
            size: 2.4, vertexColors: true, transparent: true, opacity: 0.55,
            depthWrite: false, depthTest: true, fog: false,
            blending: THREE.AdditiveBlending,
        });
        m.toneMapped = false;
        return m;
    }, [fx.dust]);

    // ── Fireflies ──────────────────
    const flyPointsRef = useRef<THREE.Points>(null);

    const flyGeo = useMemo(() => {
        const rawCount = fx.fireflies?.count ?? 0;
        if (!rawCount) return null;
        const count = prefersReducedMotion ? Math.floor(rawCount * 0.4) : rawCount;
        const rng = mulberry32(3000 + rawCount);
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
            const a = randRange(rng, 3.5, 5.0);
            col[i * 3] = c.r * a;
            col[i * 3 + 1] = c.g * a;
            col[i * 3 + 2] = c.b * a;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        return geo;
    }, [fx.fireflies, theme.building]);

    const flyMat = useMemo(() => {
        if (!fx.fireflies?.count) return null;
        const m = new THREE.PointsMaterial({
            size: 3.5, vertexColors: true, transparent: true, opacity: 1.0,
            depthWrite: false,
            depthTest: true,
            fog: false,
            blending: THREE.AdditiveBlending,
        });
        m.toneMapped = false;
        return m;
    }, [fx.fireflies]);

    // ── Aurora Ring (Emerald) — CylinderGeometry so it wraps
    const auroraGeo = useMemo(() => {
        if (!fx.aurora) return null;
        const radius = skyD(940);
        const height = skyD(260);
        return new THREE.CylinderGeometry(radius, radius, height, 160, 1, true);
    }, [fx.aurora, skyScale]);

    const { auroraRingMat0, auroraRingMat1 } = useMemo(() => {
        if (!fx.aurora) return { auroraRingMat0: null, auroraRingMat1: null };

        const texW = prefersReducedMotion ? 512 : 1024;
        const texH = prefersReducedMotion ? 128 : 256;
        const t0 = makeAuroraCurtainTexture(7001, texW, texH);
        const t1 = makeAuroraCurtainTexture(7002, texW, texH);

        const m0 = new THREE.MeshBasicMaterial({
            map: t0, transparent: true, opacity: 0.22,
            depthWrite: false, depthTest: true, fog: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
        });
        const m1 = new THREE.MeshBasicMaterial({
            map: t1, transparent: true, opacity: 0.14,
            depthWrite: false, depthTest: true, fog: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
        });
        m0.toneMapped = false;
        m1.toneMapped = false;
        m0.map!.offset.x = 0.13;
        m1.map!.offset.x = 0.57;
        return { auroraRingMat0: m0, auroraRingMat1: m1 };
    }, [fx.aurora]);

    const auroraPulse = useRef({ active: false, t: 0, dur: 1.5, nextIn: 12 });

    // ── Sunset: horizon scattering sphere + cirrus streak sprites
    const sunsetHazeGeo = useMemo(() => {
        if (!fx.sunsetHaze) return null;
        return new THREE.SphereGeometry(skyD(1200), 48, 24);
    }, [fx.sunsetHaze, skyScale]);

    const sunsetHazeMat = useMemo(() => {
        if (!fx.sunsetHaze) return null;
        const tex = makeHorizonBandTexture(256);
        const m = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.18,
            depthWrite: false, depthTest: true, fog: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            color: new THREE.Color("#ff9b7a"),
        });
        m.toneMapped = false;
        return m;
    }, [fx.sunsetHaze]);

    const sunsetCirrusGeo = useMemo(() => {
        if (!fx.sunsetCirrus) return null;
        return new THREE.SphereGeometry(skyD(1300), 48, 24);
    }, [fx.sunsetCirrus, skyScale]);

    const sunsetCirrusMat = useMemo(() => {
        if (!fx.sunsetCirrus) return null;
        const texW = prefersReducedMotion ? 512 : 1024;
        const texH = prefersReducedMotion ? 256 : 512;
        const tex = makeSunsetCirrusDomeTexture(5301, texW, texH);

        const m = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.09,
            depthWrite: false,
            depthTest: true,
            fog: false,
            side: THREE.BackSide,
            color: new THREE.Color("#ffd8c2"),
        });
        m.toneMapped = false;
        return m;
    }, [fx.sunsetCirrus]);

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
        const col = new Float32Array(totalPts * 3);
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
    const rngRef = useRef(mulberry32(9000 + (fx.stars?.count ?? 200)));

    // Meteor shower state (Midnight/Emerald etc., if enabled with high stars count)
    const shower = useRef({ active: false, left: 0, nextIn: 0, showerNextIn: 0 });

    // ── Pulse state ──────────────────────────────────────────────
    const pulse = useRef({ t: 0, dur: 0, active: false, nextIn: 6 });

    // Reset per-theme state on theme switch
    useEffect(() => {
        rngRef.current = mulberry32(9000 + (fx.stars?.count ?? 200));
        nextStreakIn.current = randRange(rngRef.current, 8, 18);

        const colAttr = streakGeo.getAttribute("color") as THREE.BufferAttribute;
        (colAttr.array as Float32Array).fill(0);
        colAttr.needsUpdate = true;

        for (const s of streakState.current) s.active = false;

        pulse.current = {
            t: 0, dur: 0, active: false,
            nextIn: fx.shootingStars?.pulseNextIn
                ? randRange(rngRef.current, fx.shootingStars.pulseNextIn * 0.5, fx.shootingStars.pulseNextIn * 1.2)
                : 12
        };

        shower.current = {
            active: false, left: 0, nextIn: 0,
            showerNextIn: randRange(rngRef.current, 90, 180),
        };

        auroraPulse.current = { active: false, t: 0, dur: 1.5, nextIn: 12 };
    }, [theme, fx, streakGeo]);

    // ── Disc placement
    const discPos = useMemo(() => {
        const cfg = fx.disc;
        const elevRad = (cfg.elevDeg * Math.PI) / 180;
        const azRad = -Math.PI * 0.18;
        const d = skyD(cfg.dist);
        return new THREE.Vector3(
            Math.cos(azRad) * Math.cos(elevRad) * d,
            Math.sin(elevRad) * d,
            -Math.sin(azRad) * Math.cos(elevRad) * d
        );
    }, [fx.disc, skyScale]);

    const discDisplayScale = skyD(discScale);

    // ── Spawn a streak ───────────────────────────────────────────
    const spawnStreak = () => {
        const rng = rngRef.current;
        const slot = streakState.current.find(s => !s.active);
        if (!slot) return;

        const ss = fx.shootingStars;
        if (!ss) return;

        const dist = skyD(fx.stars?.dist || SKY_RADIUS);
        const sd = sampleUpperHemisphereDir(rng, 18, 38);
        const ed = sampleUpperHemisphereDir(rng, 8, 18);

        slot.active = true;
        slot.t = 0;
        slot.dur = randRange(rng, ss.dur * 0.8, ss.dur * 1.3);
        slot.sx = sd.x * dist; slot.sy = sd.y * dist; slot.sz = sd.z * dist;
        slot.ex = ed.x * dist; slot.ey = ed.y * dist; slot.ez = ed.z * dist;

        slot.r = ss.color[0];
        slot.g = ss.color[1];
        slot.b = ss.color[2];
    };

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

        if (starPointsRef.current) starPointsRef.current.rotation.y += dt * 0.008;
        if (dustPointsRef.current) dustPointsRef.current.rotation.y -= dt * 0.015;
        if (flyPointsRef.current) flyPointsRef.current.rotation.y += dt * 0.010;

        // ── Aurora ring scroll + pulse
        if (fx.aurora && auroraRingMat0 && auroraRingMat1) {
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

        // ── Sunset cirrus drift
        if (fx.sunsetCirrus && sunsetCirrusMat?.map) {
            sunsetCirrusMat.map.offset.x = (sunsetCirrusMat.map.offset.x + dt * 0.0012) % 1;
        }

        // ── Streak spawner
        if (fx.shootingStars) {
            const ss = fx.shootingStars;
            nextStreakIn.current -= dt;
            if (nextStreakIn.current <= 0) {
                spawnStreak();
                nextStreakIn.current = randRange(rngRef.current, ss.nextIn, ss.nextIn * 2);
            }
        }

        // ── Meteor shower (if stars are enabled and count > 800 and not reduced motion)
        if (fx.stars && fx.stars.count >= 900 && !prefersReducedMotion) {
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

        // Update streak geometry
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

        // ── Pulse scheduler
        if (fx.shootingStars?.pulseNextIn) {
            const ss = fx.shootingStars;
            pulse.current.nextIn -= dt;
            if (pulse.current.nextIn <= 0 && !pulse.current.active) {
                pulse.current.active = true;
                pulse.current.t = 0;
                pulse.current.dur = ss.pulseDur ?? 0.5;
                const rng = rngRef.current;
                pulse.current.nextIn = randRange(rng, (ss.pulseNextIn ?? 12) * 0.8, (ss.pulseNextIn ?? 12) * 1.5);
            }

            if (pulse.current.active) {
                pulse.current.t += dt;
                const p01 = Math.min(1, pulse.current.t / pulse.current.dur);
                const bump = Math.sin(p01 * Math.PI);
                const mat = discMatRef.current;
                mat.opacity = discOpacity + bump * (ss.pulseOpacityBump ?? 0.12);
                if (p01 >= 1) {
                    pulse.current.active = false;
                    discMatRef.current.opacity = discOpacity;
                }
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
            auroraGeo?.dispose();
            auroraRingMat0?.map?.dispose(); auroraRingMat0?.dispose();
            auroraRingMat1?.map?.dispose(); auroraRingMat1?.dispose();
            sunsetHazeGeo?.dispose();
            sunsetHazeMat?.map?.dispose(); sunsetHazeMat?.dispose();
            sunsetHaloMat?.map?.dispose(); sunsetHaloMat?.dispose();
            sunsetCirrusGeo?.dispose();
            sunsetCirrusMat?.map?.dispose(); sunsetCirrusMat?.dispose();
            streakGeo.dispose(); streakMat.dispose();
        };
    }, [discTex, discMat, starGeo, starMat, dustGeo, dustMat,
        flyGeo, flyMat,
        auroraGeo, auroraRingMat0, auroraRingMat1,
        sunsetHazeGeo, sunsetHazeMat, sunsetHaloMat, sunsetCirrusGeo, sunsetCirrusMat,
        streakGeo, streakMat]);

    return (
        <group ref={rootRef} renderOrder={-20}>
            {/* Moon / Sun / Synth Sun / Glow Orb disc */}
            {fx.disc.type !== "none" && (
                <sprite
                    position={[discPos.x, discPos.y, discPos.z]}
                    scale={[discDisplayScale, discDisplayScale, 1]}
                    renderOrder={-19}
                    frustumCulled={false}
                    material={discMat}
                />
            )}

            {/* Stars */}
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

            {/* Aurora Ring layers */}
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

            {/* Sunset Cirrus Dome */}
            {sunsetCirrusGeo && sunsetCirrusMat && (
                <mesh
                    geometry={sunsetCirrusGeo}
                    material={sunsetCirrusMat}
                    renderOrder={-21}
                    frustumCulled={false}
                />
            )}

            {/* Sunset Halo */}
            {sunsetHaloMat && (
                <sprite
                    position={[discPos.x, discPos.y, discPos.z]}
                    scale={[discDisplayScale * 2.9, discDisplayScale * 2.9, 1]}
                    renderOrder={-20}
                    frustumCulled={false}
                    material={sunsetHaloMat}
                />
            )}

            {/* Shooting-star streak pool */}
            {fx.shootingStars && (
                <points
                    ref={streakRef}
                    geometry={streakGeo}
                    material={streakMat}
                    renderOrder={-15}
                    frustumCulled={false}
                />
            )}
        </group>
    );
});
