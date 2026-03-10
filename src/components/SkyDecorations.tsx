"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Shared helpers ───────────────────────────────────────────

function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
        s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
        s ^= s >>> 16;
        return (s >>> 0) / 0xffffffff;
    };
}

function makeRadialGradTex(
    size: number,
    innerColor: string,
    outerColor: string,
    innerAlpha: number,
    outerAlpha: number,
): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, hexToRgba(innerColor, innerAlpha));
    g.addColorStop(1, hexToRgba(outerColor, outerAlpha));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function hexToRgba(hex: string, a: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

// Pre-alloc vectors used in multiple useFrames
const _camPos = new THREE.Vector3();
const _tmpQ = new THREE.Quaternion();
const _fwd3 = new THREE.Vector3(0, 0, 1);

/** Billboard helper: make a mesh always face the camera */
function billboard(mesh: THREE.Object3D, cameraPos: THREE.Vector3, meshWorldPos: THREE.Vector3) {
    _camPos.copy(cameraPos).sub(meshWorldPos).normalize();
    _tmpQ.setFromUnitVectors(_fwd3, _camPos);
    mesh.quaternion.copy(_tmpQ);
}

// ─────────────────────────────────────────────────────────────
//  MIDNIGHT
// ─────────────────────────────────────────────────────────────

function MidnightStars() {
    const pointsRef = useRef<THREE.Points>(null);
    const elapsed = useRef(0);

    const COUNT = 1800;
    const RADIUS = 3200;

    const { geo, mat, phases } = useMemo(() => {
        const rand = seeded(0xdeadbeef);
        const positions = new Float32Array(COUNT * 3);
        const phases = new Float32Array(COUNT); // twinkle phase per star

        for (let i = 0; i < COUNT; i++) {
            let x, y, z, len;
            do {
                x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1;
                len = Math.sqrt(x * x + y * y + z * z);
            } while (len < 0.001 || len > 1);
            positions[i * 3] = (x / len) * RADIUS;
            positions[i * 3 + 1] = Math.abs(y / len) * RADIUS;
            positions[i * 3 + 2] = (z / len) * RADIUS;
            phases[i] = rand() * Math.PI * 2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: new THREE.Color("#b0c8f8"),
            size: 1.8, sizeAttenuation: false,
            transparent: true, opacity: 0.85,
            depthWrite: false, depthTest: true, fog: false,
        });
        return { geo, mat, phases };
    }, []);

    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        if (pointsRef.current) pointsRef.current.position.copy(camera.position);
        // Global twinkle: cheap single-material opacity oscillation + phase
        // Use a blended sine so different "clusters" appear to twinkle
        const t = elapsed.current;
        mat.opacity = 0.7 + 0.25 * Math.sin(t * 0.9 + phases[Math.floor(t * 3) % COUNT]);
    });

    return <points ref={pointsRef} geometry={geo} material={mat} renderOrder={-2} />;
}

function MidnightMoon() {
    const discRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.Mesh>(null);

    const { discGeo, discMat, glowGeo, glowMat } = useMemo(() => {
        // Moon disc with painted terminator
        const size = 256;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d")!;
        const cx = size / 2, cy = size / 2, r = size / 2 - 2;

        // Base bright face
        const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        baseGrad.addColorStop(0, "rgba(230,240,255,1)");
        baseGrad.addColorStop(0.85, "rgba(180,200,240,1)");
        baseGrad.addColorStop(1, "rgba(90,110,160,0)");
        ctx.fillStyle = baseGrad;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

        // Terminator shadow: dark half on the right side
        const shadowGrad = ctx.createLinearGradient(cx * 0.3, 0, cx * 1.7, 0);
        shadowGrad.addColorStop(0, "rgba(0,0,0,0)");
        shadowGrad.addColorStop(0.55, "rgba(0,0,20,0)");
        shadowGrad.addColorStop(0.72, "rgba(0,0,20,0.55)");
        shadowGrad.addColorStop(1, "rgba(0,0,20,0.92)");
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = shadowGrad;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";

        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;

        const discGeo = new THREE.CircleGeometry(30, 48);
        const discMat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 1,
            depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
        });

        const glowTex = makeRadialGradTex(256, "#8090c0", "#000820", 0.45, 0);
        const glowGeo = new THREE.PlaneGeometry(200, 200);
        const glowMat = new THREE.MeshBasicMaterial({
            map: glowTex, transparent: true, opacity: 0.5,
            depthWrite: false, depthTest: false, fog: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        return { discGeo, discMat, glowGeo, glowMat };
    }, []);

    useEffect(() => () => {
        discMat.map?.dispose(); discMat.dispose();
        glowMat.map?.dispose(); glowMat.dispose();
        discGeo.dispose(); glowGeo.dispose();
    }, [discGeo, discMat, glowGeo, glowMat]);

    const LOCAL = useMemo(() => {
        const az = Math.PI * 0.35, el = Math.PI * 0.32, d = 3000;
        return new THREE.Vector3(Math.cos(el) * Math.sin(az) * d, Math.sin(el) * d, Math.cos(el) * Math.cos(az) * d);
    }, []);

    const worldPos = useRef(new THREE.Vector3());

    useFrame(({ camera }) => {
        worldPos.current.copy(camera.position).add(LOCAL);
        if (discRef.current) { discRef.current.position.copy(worldPos.current); billboard(discRef.current, camera.position, worldPos.current); }
        if (glowRef.current) { glowRef.current.position.copy(worldPos.current); billboard(glowRef.current, camera.position, worldPos.current); }
    });

    return (
        <>
            <mesh ref={glowRef} geometry={glowGeo} material={glowMat} renderOrder={-2} />
            <mesh ref={discRef} geometry={discGeo} material={discMat} renderOrder={-1} />
        </>
    );
}

function ShootingStars() {
    const POOL = 3;
    const meshRefs = useRef<(THREE.Mesh | null)[]>(Array(POOL).fill(null));
    const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>(Array(POOL).fill(null));

    // Per-slot state
    const active = useRef<boolean[]>(Array(POOL).fill(false));
    const progress = useRef<number[]>(Array(POOL).fill(0));
    const duration = useRef<number[]>(Array(POOL).fill(1));
    const direction = useRef<THREE.Vector3[]>(Array.from({ length: POOL }, () => new THREE.Vector3()));
    const origin = useRef<THREE.Vector3[]>(Array.from({ length: POOL }, () => new THREE.Vector3()));
    const nextFire = useRef<number[]>(Array(POOL).fill(0));
    const elapsed = useRef(0);

    const { geo, mats } = useMemo(() => {
        // Streak texture: bright core fading to transparent
        const size = 256;
        const c = document.createElement("canvas");
        c.width = size; c.height = 12;
        const ctx = c.getContext("2d")!;
        const g = ctx.createLinearGradient(0, 0, size, 0);
        g.addColorStop(0, "rgba(200,220,255,0)");
        g.addColorStop(0.3, "rgba(220,235,255,0.9)");
        g.addColorStop(0.85, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0.3)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, 12);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;

        const geo = new THREE.PlaneGeometry(220, 3);
        const mats = Array.from({ length: POOL }, () =>
            new THREE.MeshBasicMaterial({
                map: tex, transparent: true, opacity: 0,
                depthWrite: false, depthTest: false, fog: false,
                blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            })
        );
        return { geo, mats };
    }, []);

    useEffect(() => () => {
        geo.dispose();
        mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    }, [geo, mats]); // eslint-disable-line react-hooks/exhaustive-deps

    const rand = useMemo(() => seeded(0x5eed1234), []);

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        const t = elapsed.current;

        for (let i = 0; i < POOL; i++) {
            const mesh = meshRefs.current[i];
            const mat = matRefs.current[i];
            if (!mesh || !mat) continue;

            if (!active.current[i]) {
                if (t >= nextFire.current[i]) {
                    active.current[i] = true;
                    progress.current[i] = 0;
                    duration.current[i] = 0.8 + rand() * 0.6;

                    // Random direction in upper sky (camera-relative)
                    const az = rand() * Math.PI * 2;
                    const el = 0.3 + rand() * 0.5;
                    const d = 2800;
                    origin.current[i].set(
                        camera.position.x + Math.cos(el) * Math.sin(az) * d,
                        camera.position.y + Math.sin(el) * d,
                        camera.position.z + Math.cos(el) * Math.cos(az) * d,
                    );
                    direction.current[i].set(rand() - 0.5, -(0.2 + rand() * 0.4), rand() - 0.5).normalize();
                }
                mat.opacity = 0;
                mesh.visible = false;
                continue;
            }

            progress.current[i] += delta / duration.current[i];
            if (progress.current[i] >= 1) {
                active.current[i] = false;
                mat.opacity = 0;
                mesh.visible = false;
                // Schedule next: 20–60s later
                nextFire.current[i] = t + 20 + rand() * 40;
                continue;
            }

            mesh.visible = true;
            const p = progress.current[i];
            // Fade: quick in, slower out
            mat.opacity = p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85);

            const travel = p * 350;
            mesh.position.copy(origin.current[i])
                .addScaledVector(direction.current[i], travel);

            // Orient along direction
            mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(1, 0, 0),
                direction.current[i]
            );
        }
    });

    return (
        <>
            {Array.from({ length: POOL }, (_, i) => (
                <mesh
                    key={i}
                    ref={el => { meshRefs.current[i] = el; matRefs.current[i] = el?.material as THREE.MeshBasicMaterial ?? null; }}
                    geometry={geo}
                    material={mats[i]}
                    renderOrder={-1}
                    visible={false}
                />
            ))}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
//  SUNSET
// ─────────────────────────────────────────────────────────────

const SUN_LOCAL = new THREE.Vector3(
    Math.cos(0.18) * Math.sin(Math.PI * 0.6) * 2800,
    Math.sin(0.18) * 2800,
    Math.cos(0.18) * Math.cos(Math.PI * 0.6) * 2800,
);

function SunsetSun() {
    const discRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Mesh>(null);
    const worldPos = useRef(new THREE.Vector3());

    const { discGeo, discMat, haloGeo, haloMat } = useMemo(() => {
        // Inner disc
        const dTex = makeRadialGradTex(256, "#fff8e0", "#f0c060", 1.0, 0);
        const discGeo = new THREE.PlaneGeometry(110, 110);
        const discMat = new THREE.MeshBasicMaterial({
            map: dTex, transparent: true, opacity: 0.92,
            depthWrite: false, depthTest: false, fog: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        // Outer halo
        const hTex = makeRadialGradTex(512, "#f0a030", "#c05000", 0.55, 0);
        const haloGeo = new THREE.PlaneGeometry(550, 550);
        const haloMat = new THREE.MeshBasicMaterial({
            map: hTex, transparent: true, opacity: 0.55,
            depthWrite: false, depthTest: false, fog: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        return { discGeo, discMat, haloGeo, haloMat };
    }, []);

    useEffect(() => () => {
        discMat.map?.dispose(); discMat.dispose(); discGeo.dispose();
        haloMat.map?.dispose(); haloMat.dispose(); haloGeo.dispose();
    }, [discGeo, discMat, haloGeo, haloMat]);

    useFrame(({ camera }) => {
        worldPos.current.copy(camera.position).add(SUN_LOCAL);
        if (discRef.current) { discRef.current.position.copy(worldPos.current); billboard(discRef.current, camera.position, worldPos.current); }
        if (haloRef.current) { haloRef.current.position.copy(worldPos.current); billboard(haloRef.current, camera.position, worldPos.current); }
    });

    return (
        <>
            <mesh ref={haloRef} geometry={haloGeo} material={haloMat} renderOrder={-3} />
            <mesh ref={discRef} geometry={discGeo} material={discMat} renderOrder={-2} />
        </>
    );
}

interface CloudBandDef { theta: number; phi: number; scaleX: number; scaleY: number; speed: number; }

const _cloudBandPos = new THREE.Vector3();

function SunsetClouds() {
    const groupRef = useRef<THREE.Group>(null);
    const elapsed = useRef(0);

    const BANDS: CloudBandDef[] = useMemo(() => {
        const rand = seeded(0xC10D5);
        return Array.from({ length: 4 }, (_, i) => ({
            theta: (i / 4) * Math.PI * 2 + rand() * 0.6,
            phi: 0.08 + rand() * 0.12,
            scaleX: 850 + rand() * 500,
            scaleY: 90 + rand() * 80,
            speed: (rand() > 0.5 ? 1 : -1) * (0.0002 + rand() * 0.0005),
        }));
    }, []);

    const { geo, mat } = useMemo(() => {
        const c = document.createElement("canvas");
        c.width = 512; c.height = 128;
        const ctx = c.getContext("2d")!;
        const g = ctx.createRadialGradient(256, 64, 0, 256, 64, 256);
        g.addColorStop(0, "rgba(255,210,160,0.95)");
        g.addColorStop(0.4, "rgba(240,160,100,0.55)");
        g.addColorStop(0.75, "rgba(200,100,60,0.18)");
        g.addColorStop(1, "rgba(180,80,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 128);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.22,
            depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide,
        });
        return { geo, mat };
    }, []);

    useEffect(() => () => { mat.map?.dispose(); mat.dispose(); geo.dispose(); }, [geo, mat]);

    const meshRefs = useRef<(THREE.Mesh | null)[]>(BANDS.map(() => null));

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        if (groupRef.current) groupRef.current.position.copy(camera.position);
        const t = elapsed.current;
        BANDS.forEach((b, i) => {
            const mesh = meshRefs.current[i];
            if (!mesh) return;
            const theta = b.theta + t * b.speed;
            const D = 2600;
            _cloudBandPos.set(
                Math.cos(b.phi) * Math.sin(theta) * D,
                Math.sin(b.phi) * D,
                Math.cos(b.phi) * Math.cos(theta) * D,
            );
            mesh.position.copy(_cloudBandPos);
            mesh.scale.set(b.scaleX, b.scaleY, 1);
            billboard(mesh, camera.position, _cloudBandPos.clone().add(camera.position));
        });
    });

    return (
        <group ref={groupRef} renderOrder={-3}>
            {BANDS.map((_, i) => (
                <mesh key={i} ref={el => { meshRefs.current[i] = el; }} geometry={geo} material={mat} renderOrder={-3} />
            ))}
        </group>
    );
}

interface BirdDef { theta: number; phi: number; size: number; speed: number; }

const _birdPos = new THREE.Vector3();

function SunsetBirds() {
    const groupRef = useRef<THREE.Group>(null);
    const elapsed = useRef(0);

    const BIRDS: BirdDef[] = useMemo(() => {
        const rand = seeded(0xB1D5);
        return Array.from({ length: 7 }, () => ({
            theta: rand() * Math.PI * 2,
            phi: 0.04 + rand() * 0.1,
            size: 14 + rand() * 12,
            speed: 0.0006 + rand() * 0.0012,
        }));
    }, []);

    const { geo, mat } = useMemo(() => {
        // Draw a simple "M" bird silhouette
        const size = 64;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d")!;
        ctx.strokeStyle = "rgba(20,10,5,0.85)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        // Wing shape: two arcs meeting in center
        ctx.beginPath();
        ctx.moveTo(4, size * 0.45);
        ctx.quadraticCurveTo(size * 0.25, size * 0.28, size * 0.5, size * 0.42);
        ctx.quadraticCurveTo(size * 0.75, size * 0.28, size - 4, size * 0.45);
        ctx.stroke();
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.75,
            depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide,
        });
        return { geo, mat };
    }, []);

    useEffect(() => () => { mat.map?.dispose(); mat.dispose(); geo.dispose(); }, [geo, mat]);

    const meshRefs = useRef<(THREE.Mesh | null)[]>(BIRDS.map(() => null));

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        if (groupRef.current) groupRef.current.position.copy(camera.position);
        const t = elapsed.current;
        BIRDS.forEach((b, i) => {
            const mesh = meshRefs.current[i];
            if (!mesh) return;
            const theta = b.theta + t * b.speed;
            const D = 1800;
            _birdPos.set(
                Math.cos(b.phi) * Math.sin(theta) * D,
                Math.sin(b.phi) * D,
                Math.cos(b.phi) * Math.cos(theta) * D,
            );
            mesh.position.copy(_birdPos);
            mesh.scale.set(b.size, b.size * 0.55, 1);
            billboard(mesh, camera.position, _birdPos.clone().add(camera.position));
        });
    });

    return (
        <group ref={groupRef} renderOrder={-1}>
            {BIRDS.map((_, i) => (
                <mesh key={i} ref={el => { meshRefs.current[i] = el; }} geometry={geo} material={mat} renderOrder={-1} />
            ))}
        </group>
    );
}

// ─────────────────────────────────────────────────────────────
//  NEON
// ─────────────────────────────────────────────────────────────

const NEON_SUN_LOCAL = new THREE.Vector3(
    Math.cos(0.15) * Math.sin(Math.PI * -0.4) * 2800,
    Math.sin(0.15) * 2800,
    Math.cos(0.15) * Math.cos(Math.PI * -0.4) * 2800,
);

function NeonSun() {
    const discRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Mesh>(null);
    const worldPos = useRef(new THREE.Vector3());

    const { discGeo, discMat, haloGeo, haloMat } = useMemo(() => {
        // Synthwave striped disc
        const size = 512;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d")!;
        const cx = size / 2, cy = size / 2, r = size / 2 - 2;

        // Clip to circle
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();

        // Top half: solid magenta-pink gradient
        const topGrad = ctx.createLinearGradient(0, 0, 0, cy);
        topGrad.addColorStop(0, "#cc44ff");
        topGrad.addColorStop(1, "#ff44cc");
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, size, cy);

        // Bottom half: horizontal stripes (perspective lines — narrowing toward horizon)
        const stripeColors = ["#ff00cc", "#cc00ff"];
        const stripeData = [
            { y: 0, h: 0.30 }, { y: 0.30, h: 0.22 }, { y: 0.52, h: 0.16 },
            { y: 0.68, h: 0.12 }, { y: 0.80, h: 0.09 }, { y: 0.89, h: 0.07 },
            { y: 0.96, h: 0.04 },
        ];
        stripeData.forEach(({ y, h }, idx) => {
            const ry = cy + y * r;
            const rh = h * r;
            ctx.fillStyle = stripeColors[idx % 2];
            ctx.fillRect(0, ry, size, rh);
            // Gap between stripes (dark)
            ctx.fillStyle = "#0a0010";
            ctx.fillRect(0, ry + rh * 0.55, size, rh * 0.45);
        });
        ctx.restore();

        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const discGeo = new THREE.PlaneGeometry(200, 200);
        const discMat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.92,
            depthWrite: false, depthTest: false, fog: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });

        const hTex = makeRadialGradTex(512, "#c040ff", "#400080", 0.55, 0);
        const haloGeo = new THREE.PlaneGeometry(600, 600);
        const haloMat = new THREE.MeshBasicMaterial({
            map: hTex, transparent: true, opacity: 0.6,
            depthWrite: false, depthTest: false, fog: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        return { discGeo, discMat, haloGeo, haloMat };
    }, []);

    useEffect(() => () => {
        discMat.map?.dispose(); discMat.dispose(); discGeo.dispose();
        haloMat.map?.dispose(); haloMat.dispose(); haloGeo.dispose();
    }, [discGeo, discMat, haloGeo, haloMat]);

    useFrame(({ camera }) => {
        worldPos.current.copy(camera.position).add(NEON_SUN_LOCAL);
        if (haloRef.current) { haloRef.current.position.copy(worldPos.current); billboard(haloRef.current, camera.position, worldPos.current); }
        if (discRef.current) { discRef.current.position.copy(worldPos.current); billboard(discRef.current, camera.position, worldPos.current); }
    });

    return (
        <>
            <mesh ref={haloRef} geometry={haloGeo} material={haloMat} renderOrder={-3} />
            <mesh ref={discRef} geometry={discGeo} material={discMat} renderOrder={-2} />
        </>
    );
}

const NEON_COLORS = ["#ff40c0", "#00e0ff", "#c040ff", "#ff8040", "#40ffcc"];

function NeonDust() {
    const COUNT = 200;
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const elapsed = useRef(0);

    const rand = useMemo(() => seeded(0xE0D), []);

    type DustParticle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number; size: number; colorIdx: number; };
    const particles = useMemo<DustParticle[]>(() => {
        const r = seeded(0xE0D);
        return Array.from({ length: COUNT }, () => ({
            x: (r() - 0.5) * 1200, y: -50 + r() * 300, z: (r() - 0.5) * 1200,
            vx: (r() - 0.5) * 0.5, vy: 4 + r() * 8, vz: (r() - 0.5) * 0.5,
            phase: r() * Math.PI * 2, size: 3 + r() * 5, colorIdx: Math.floor(r() * NEON_COLORS.length),
        }));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const { geo, mats } = useMemo(() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        const mats = NEON_COLORS.map(col =>
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(col), transparent: true, opacity: 0.75,
                depthWrite: false, depthTest: false, fog: false,
                blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            })
        );
        return { geo, mats };
    }, []);

    useEffect(() => () => {
        geo.dispose(); mats.forEach(m => m.dispose());
    }, [geo, mats]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    // One InstancedMesh per color group
    const colorGroups = useMemo(() => {
        const groups: number[][] = NEON_COLORS.map(() => []);
        particles.forEach((p, i) => groups[p.colorIdx].push(i));
        return groups;
    }, [particles]);

    const instancedRefs = useRef<(THREE.InstancedMesh | null)[]>(NEON_COLORS.map(() => null));

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        const t = elapsed.current;
        if (groupRef.current) groupRef.current.position.copy(camera.position);

        colorGroups.forEach((indices, ci) => {
            const mesh = instancedRefs.current[ci];
            if (!mesh) return;
            indices.forEach((pi, localI) => {
                const p = particles[pi];
                let py = p.y + t * p.vy;
                if (py > 400) py = py % 450 - 60;
                const px = p.x + Math.sin(t * 0.3 + p.phase) * 15;
                dummy.position.set(px, py, p.z);
                const op = 0.4 + 0.35 * Math.sin(t * 1.5 + p.phase);
                dummy.scale.setScalar(p.size * (0.8 + 0.2 * Math.sin(t * 2 + p.phase)));
                dummy.updateMatrix();
                mesh.setMatrixAt(localI, dummy.matrix);
                // opacity via color alpha isn't possible on InstancedMesh directly,
                // but we can vary scale to simulate brightness
                void op; // suppress "unused" warning
            });
            mesh.instanceMatrix.needsUpdate = true;
        });
    });

    return (
        <group ref={groupRef} renderOrder={-1}>
            {NEON_COLORS.map((_, ci) => (
                <instancedMesh
                    key={ci}
                    ref={el => { instancedRefs.current[ci] = el; }}
                    args={[geo, mats[ci], colorGroups[ci].length]}
                    renderOrder={-1}
                />
            ))}
        </group>
    );
}

// ─────────────────────────────────────────────────────────────
//  EMERALD
// ─────────────────────────────────────────────────────────────

function AuroraRibbons() {
    const groupRef = useRef<THREE.Group>(null);
    const meshRefs = useRef<(THREE.Mesh | null)[]>([null, null]);
    const elapsed = useRef(0);

    const RIBBON_DEFS = useMemo(() => [
        { theta: Math.PI * 0.2, phi: 0.55, waveSpeed: 0.18, waveAmp: 0.05, phase: 0 },
        { theta: Math.PI * 1.1, phi: 0.62, waveSpeed: 0.13, waveAmp: 0.04, phase: 1.8 },
    ], []);

    const { geo, mats } = useMemo(() => {
        const geo = new THREE.PlaneGeometry(700, 550, 1, 32);

        // Vertical gradient — teal/green curtain
        const mats = [
            (() => {
                const c = document.createElement("canvas");
                c.width = 4; c.height = 256;
                const ctx = c.getContext("2d")!;
                const g = ctx.createLinearGradient(0, 0, 0, 256);
                g.addColorStop(0, "rgba(0,210,100,0)");
                g.addColorStop(0.25, "rgba(0,240,150,0.35)");
                g.addColorStop(0.5, "rgba(60,255,140,0.55)");
                g.addColorStop(0.75, "rgba(0,200,80,0.28)");
                g.addColorStop(1, "rgba(0,150,60,0)");
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, 4, 256);
                const tex = new THREE.CanvasTexture(c);
                tex.colorSpace = THREE.SRGBColorSpace;
                return new THREE.MeshBasicMaterial({
                    map: tex, transparent: true, opacity: 0.28,
                    depthWrite: false, depthTest: false, fog: false,
                    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
                });
            })(),
            (() => {
                const c = document.createElement("canvas");
                c.width = 4; c.height = 256;
                const ctx = c.getContext("2d")!;
                const g = ctx.createLinearGradient(0, 0, 0, 256);
                g.addColorStop(0, "rgba(0,180,120,0)");
                g.addColorStop(0.3, "rgba(80,255,200,0.25)");
                g.addColorStop(0.55, "rgba(0,220,160,0.45)");
                g.addColorStop(0.8, "rgba(0,160,80,0.2)");
                g.addColorStop(1, "rgba(0,100,40,0)");
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, 4, 256);
                const tex = new THREE.CanvasTexture(c);
                tex.colorSpace = THREE.SRGBColorSpace;
                return new THREE.MeshBasicMaterial({
                    map: tex, transparent: true, opacity: 0.22,
                    depthWrite: false, depthTest: false, fog: false,
                    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
                });
            })(),
        ];
        return { geo, mats };
    }, []);

    useEffect(() => () => {
        geo.dispose(); mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    }, [geo, mats]); // eslint-disable-line react-hooks/exhaustive-deps

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        const t = elapsed.current;
        if (groupRef.current) groupRef.current.position.copy(camera.position);

        RIBBON_DEFS.forEach((rd, i) => {
            const mesh = meshRefs.current[i];
            if (!mesh) return;
            const D = 2500;
            mesh.position.set(
                Math.cos(rd.phi) * Math.sin(rd.theta) * D,
                Math.sin(rd.phi) * D,
                Math.cos(rd.phi) * Math.cos(rd.theta) * D,
            );
            // Wave: rotate slowly left-right
            mesh.rotation.set(0, rd.theta + Math.sin(t * rd.waveSpeed + rd.phase) * rd.waveAmp, 0);
        });
    });

    return (
        <group ref={groupRef} renderOrder={-3}>
            {RIBBON_DEFS.map((_, i) => (
                <mesh key={i} ref={el => { meshRefs.current[i] = el; }} geometry={geo} material={mats[i]} renderOrder={-3} />
            ))}
        </group>
    );
}

const EMERALD_WIN_COLORS = ["#0e4429", "#006d32", "#26a641", "#39d353", "#c8e64a"];

function EmeraldFireflies() {
    const COUNT = 120;
    const groupRef = useRef<THREE.Group>(null);
    const elapsed = useRef(0);

    type Firefly = { x: number; y: number; z: number; vx: number; vy: number; phase: number; size: number; colorIdx: number; };

    const particles = useMemo<Firefly[]>(() => {
        const r = seeded(0xF1EF1);
        return Array.from({ length: COUNT }, () => ({
            x: (r() - 0.5) * 1400, y: 20 + r() * 350, z: (r() - 0.5) * 1400,
            vx: (r() - 0.5) * 0.8, vy: (r() - 0.5) * 1.2,
            phase: r() * Math.PI * 2, size: 4 + r() * 7,
            colorIdx: Math.floor(r() * EMERALD_WIN_COLORS.length),
        }));
    }, []);

    const { geo, mats } = useMemo(() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        const mats = EMERALD_WIN_COLORS.map(col =>
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(col), transparent: true, opacity: 0.8,
                depthWrite: false, depthTest: false, fog: false,
                blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            })
        );
        return { geo, mats };
    }, []);

    useEffect(() => () => {
        geo.dispose(); mats.forEach(m => m.dispose());
    }, [geo, mats]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    const colorGroups = useMemo(() => {
        const groups: number[][] = EMERALD_WIN_COLORS.map(() => []);
        particles.forEach((p, i) => groups[p.colorIdx].push(i));
        return groups;
    }, [particles]);

    const instancedRefs = useRef<(THREE.InstancedMesh | null)[]>(EMERALD_WIN_COLORS.map(() => null));

    useFrame(({ camera }, delta) => {
        elapsed.current += delta;
        const t = elapsed.current;
        if (groupRef.current) groupRef.current.position.copy(camera.position);

        colorGroups.forEach((indices, ci) => {
            const mesh = instancedRefs.current[ci];
            if (!mesh) return;
            indices.forEach((pi, localI) => {
                const p = particles[pi];
                const px = p.x + Math.sin(t * 0.4 + p.phase) * 18 + t * p.vx;
                const py = p.y + Math.sin(t * 0.6 + p.phase + 1) * 22 + t * p.vy;
                const size = p.size * (0.7 + 0.3 * Math.sin(t * 2.2 + p.phase));
                dummy.position.set(px % 700, py, p.z);
                dummy.scale.setScalar(size);
                dummy.updateMatrix();
                mesh.setMatrixAt(localI, dummy.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
        });
    });

    return (
        <group ref={groupRef} renderOrder={-1}>
            {EMERALD_WIN_COLORS.map((_, ci) => (
                <instancedMesh
                    key={ci}
                    ref={el => { instancedRefs.current[ci] = el; }}
                    args={[geo, mats[ci], colorGroups[ci].length]}
                    renderOrder={-1}
                />
            ))}
        </group>
    );
}

// ─────────────────────────────────────────────────────────────
//  ROOT EXPORT
// ─────────────────────────────────────────────────────────────

export default function SkyDecorations({ themeIndex }: { themeIndex: number }) {
    switch (themeIndex) {
        case 0: // Midnight
            return (
                <>
                    <MidnightStars />
                    <MidnightMoon />
                    <ShootingStars />
                </>
            );
        case 1: // Sunset
            return (
                <>
                    <SunsetSun />
                    <SunsetBirds />
                </>
            );
        case 2: // Neon
            return (
                <>
                    <NeonSun />
                    <NeonDust />
                </>
            );
        case 3: // Emerald
            return (
                <>
                    <AuroraRibbons />
                    <EmeraldFireflies />
                </>
            );
        default:
            return null;
    }
}
