"use client";

import { useRef, useMemo, useEffect, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { createLedTexture, SCROLL_SPEED } from "./SkyAds";

// ─── Theme (matching city / ShopPreview) ─────────────────────

const THEME = {
  windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
  windowOff: "#0c0e18",
  face: "#101828",
  roof: "#2a3858",
  fogColor: "#0a1428",
  ambientColor: "#4060b0",
  sunColor: "#7090d0",
  fillColor: "#304080",
  groundColor: "#242c38",
  hemiSky: "#5080a0",
  hemiGround: "#202830",
};

const WHITE = new THREE.Color("#ffffff");

// ─── Building for building-ad previews ───────────────────────

const B_W = 20;
const B_H = 50;
const B_D = 16;

function createWindowTexture(rows: number, cols: number, seed: number): THREE.CanvasTexture {
  const WS = 6, GAP = 2, PAD = 3;
  const w = PAD * 2 + cols * WS + Math.max(0, cols - 1) * GAP;
  const h = PAD * 2 + rows * WS + Math.max(0, rows - 1) * GAP;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = THEME.face;
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * (WS + GAP);
      const y = PAD + r * (WS + GAP);
      ctx.fillStyle = rand() < 0.65
        ? THEME.windowLit[Math.floor(rand() * THEME.windowLit.length)]
        : THEME.windowOff;
      ctx.fillRect(x, y, WS, WS);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function PreviewBuilding() {
  const floors = Math.round(B_H / 5);
  const cols = Math.round(B_W / 5);
  const sideCols = Math.round(B_D / 5);

  const materials = useMemo(() => {
    const front = createWindowTexture(floors, cols, 5754);
    const side = createWindowTexture(floors, sideCols, 13673);
    const roofColor = new THREE.Color(THEME.roof);
    const roof = new THREE.MeshStandardMaterial({
      color: roofColor, emissive: roofColor, emissiveIntensity: 1.5, roughness: 0.6,
    });
    const makeFace = (tex: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map: tex, emissive: WHITE.clone(), emissiveMap: tex,
        emissiveIntensity: 2.0, roughness: 0.85, metalness: 0,
      });
    return [makeFace(side), makeFace(side), roof, roof, makeFace(front), makeFace(front)];
  }, [floors, cols, sideCols]);

  return (
    <mesh material={materials}>
      <boxGeometry args={[B_W, B_H, B_D]} />
    </mesh>
  );
}

// ─── Preview: Plane ──────────────────────────────────────────

function PlanePreviewScene({ text, color, bgColor }: AdProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/paper-plane.glb");
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(text || "YOUR BANNER TEXT", color, bgColor),
    [text, color, bgColor],
  );
  const ledMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#000000", emissiveMap: tex, emissive: "#ffffff",
      emissiveIntensity: 1.2, toneMapped: false,
    }),
    [tex],
  );

  const BANNER_L = 45, BANNER_H = 10, ROPE_GAP = 18, DROP = 5;

  const ropeLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(
      new Float32Array([0, -2, 5, 0, -DROP, ROPE_GAP]), 3,
    ));
    const mat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 });
    return new THREE.Line(geo, mat);
  }, []);

  useEffect(() => () => {
    tex.dispose(); ledMat.dispose();
    ropeLine.geometry.dispose();
    (ropeLine.material as THREE.Material).dispose();
  }, [tex, ledMat, ropeLine]);

  useFrame(({ clock }) => {
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED) % 1;
  });

  return (
    <group ref={groupRef}>
      <group scale={[3.5, 3.5, 3.5]} rotation={[0, Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
      </group>
      {/* Light on the plane so it's visible in dark scene */}
      <directionalLight position={[20, 15, 10]} intensity={3} color="#ffffff" />
      {/* Tow rope */}
      <primitive object={ropeLine} />
      {/* Banner side 1 */}
      <mesh material={ledMat} position={[0.15, -DROP - BANNER_H / 2, ROPE_GAP + BANNER_L / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[BANNER_L, BANNER_H]} />
      </mesh>
      {/* Banner side 2 */}
      <mesh material={ledMat} position={[-0.15, -DROP - BANNER_H / 2, ROPE_GAP + BANNER_L / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[BANNER_L, BANNER_H]} />
      </mesh>
      <pointLight position={[0, -DROP - BANNER_H / 2, ROPE_GAP + BANNER_L / 2]} color={color} intensity={2} distance={30} />
    </group>
  );
}

// ─── Preview: Blimp ──────────────────────────────────────────

function BlimpPreviewScene({ text, color, bgColor }: AdProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(text || "YOUR BANNER TEXT", color, bgColor),
    [text, color, bgColor],
  );
  const ledMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#000000", emissiveMap: tex, emissive: "#ffffff",
      emissiveIntensity: 1.2, toneMapped: false,
    }),
    [tex],
  );
  useEffect(() => () => { tex.dispose(); ledMat.dispose(); }, [tex, ledMat]);

  useFrame(({ clock }) => {
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED) % 1;
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh scale={[0.7, 0.5, 1.6]}>
        <sphereGeometry args={[15, 16, 12]} />
        <meshStandardMaterial color="#c0c8d0" emissive="#606870" emissiveIntensity={0.3} metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Belly stripe */}
      <mesh scale={[0.72, 0.14, 1.62]} position={[0, -1, 0]}>
        <sphereGeometry args={[15, 16, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      {/* Upper trim */}
      <mesh scale={[0.71, 0.07, 1.61]} position={[0, 3.5, 0]}>
        <sphereGeometry args={[15, 16, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* Gondola */}
      <mesh position={[0, -9, 0]}>
        <boxGeometry args={[6, 3, 10]} />
        <meshStandardMaterial color="#8890a0" emissive="#404860" emissiveIntensity={0.3} />
      </mesh>
      {/* Struts */}
      {[
        [2, -6.5, 3, 0.15, 0.2],
        [-2, -6.5, 3, 0.15, -0.2],
        [2, -6.5, -3, -0.15, 0.2],
        [-2, -6.5, -3, -0.15, -0.2],
      ].map(([x, y, z, rx, rz], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} rotation={[rx as number, 0, rz as number]}>
          <boxGeometry args={[0.3, 4, 0.3]} />
          <meshStandardMaterial color="#9098a8" emissive="#404860" emissiveIntensity={0.2} />
        </mesh>
      ))}
      {/* Tail fin vertical */}
      <mesh position={[0, 2, -22]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.4, 7, 5]} />
        <meshStandardMaterial color="#9098a8" emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 5.5, -21]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.5, 1, 3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      {/* Tail fin horizontal */}
      <mesh position={[0, -1, -22]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[6, 0.4, 5]} />
        <meshStandardMaterial color="#9098a8" emissive={color} emissiveIntensity={0.2} />
      </mesh>
      {/* LED screens */}
      <mesh material={ledMat} position={[10.8, -2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[26, 9]} />
      </mesh>
      <mesh material={ledMat} position={[-10.8, -2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[26, 9]} />
      </mesh>
      <pointLight position={[13, -2, 0]} color={color} intensity={1.5} distance={25} />
      <pointLight position={[-13, -2, 0]} color={color} intensity={1.5} distance={25} />
      <pointLight position={[0, -11, 0]} intensity={8} distance={50} color="#f0d870" />
    </group>
  );
}

// ─── Preview: Billboard ──────────────────────────────────────

function BillboardPreviewScene({ text, color, bgColor }: AdProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(text || "YOUR BANNER TEXT", color, bgColor),
    [text, color, bgColor],
  );
  const ledMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#000000", emissiveMap: tex, emissive: "#ffffff",
      emissiveIntensity: 1.2, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1,
    }),
    [tex],
  );
  useEffect(() => () => { tex.dispose(); ledMat.dispose(); }, [tex, ledMat]);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.3;
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED) % 1;
  });

  const panelW = B_W * 0.9;
  const panelH = panelW * 0.3;
  const y = B_H * 0.95;
  const zOff = B_D / 2 + 0.2;

  return (
    <group ref={groupRef}>
      <PreviewBuilding />
      <group position={[0, -B_H / 2, 0]}>
        {/* Frame */}
        <mesh position={[0, y, zOff - 0.3]}>
          <boxGeometry args={[panelW + 0.8, panelH + 0.8, 0.3]} />
          <meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* LED */}
        <mesh material={ledMat} position={[0, y, zOff + 0.1]}>
          <planeGeometry args={[panelW, panelH]} />
        </mesh>
        {/* Struts */}
        <mesh position={[-panelW * 0.3, y - panelH / 2 - 1.5, zOff - 0.3]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.3, 3, 0.3]} />
          <meshStandardMaterial color="#333" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[panelW * 0.3, y - panelH / 2 - 1.5, zOff - 0.3]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.3, 3, 0.3]} />
          <meshStandardMaterial color="#333" metalness={0.5} roughness={0.4} />
        </mesh>
        <pointLight position={[0, y, zOff + 2]} color={color} intensity={1.5} distance={20} />
      </group>
    </group>
  );
}

// ─── Preview: Rooftop Sign ───────────────────────────────────

function RooftopSignPreviewScene({ text, color, bgColor }: AdProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(text || "YOUR BANNER TEXT", color, bgColor),
    [text, color, bgColor],
  );
  const ledMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#000000", emissiveMap: tex, emissive: "#ffffff",
      emissiveIntensity: 1.2, toneMapped: false,
    }),
    [tex],
  );
  useEffect(() => () => { tex.dispose(); ledMat.dispose(); }, [tex, ledMat]);

  useFrame(({ clock }, delta) => {
    if (groupRef.current) groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.3;
    if (spinRef.current) spinRef.current.rotation.y += 0.4 * Math.min(delta, 0.05);
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED) % 1;
  });

  const signW = B_W * 1.2;
  const signH = 10;
  const poleH = 26;
  const poleY = B_H + poleH / 2;
  const signY = B_H + poleH + signH / 2;

  return (
    <group ref={groupRef}>
      <PreviewBuilding />
      <group position={[0, -B_H / 2, 0]}>
        {/* Pole */}
        <mesh position={[0, poleY, 0]}>
          <cylinderGeometry args={[0.3, 0.4, poleH, 6]} />
          <meshStandardMaterial color="#666" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Spinning sign */}
        <group ref={spinRef} position={[0, signY, 0]}>
          <mesh position={[0, signH / 2 + 0.2, 0]}>
            <boxGeometry args={[signW + 1, 0.4, 0.6]} />
            <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, -signH / 2 - 0.2, 0]}>
            <boxGeometry args={[signW + 1, 0.4, 0.6]} />
            <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh material={ledMat} position={[0, 0, 0.15]}>
            <planeGeometry args={[signW, signH]} />
          </mesh>
          <mesh material={ledMat} position={[0, 0, -0.15]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[signW, signH]} />
          </mesh>
          <pointLight position={[0, 0, 3]} color={color} intensity={1.5} distance={15} />
          <pointLight position={[0, 0, -3]} color={color} intensity={1.5} distance={15} />
        </group>
      </group>
    </group>
  );
}

// ─── Preview: LED Wrap ───────────────────────────────────────

function LedWrapPreviewScene({ text, color, bgColor }: AdProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(text || "YOUR BANNER TEXT", color, bgColor),
    [text, color, bgColor],
  );
  const ledMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#000000", emissiveMap: tex, emissive: "#ffffff",
      emissiveIntensity: 1.2, toneMapped: false,
    }),
    [tex],
  );
  const accentMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 2, toneMapped: false,
    }),
    [color],
  );
  useEffect(() => () => { tex.dispose(); ledMat.dispose(); accentMat.dispose(); }, [tex, ledMat, accentMat]);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.3;
    const t = clock.elapsedTime;
    if (needsScroll) tex.offset.x = (t * SCROLL_SPEED * 0.8) % 1;
    ledMat.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.5;
    accentMat.emissiveIntensity = 1.5 + Math.sin(t * 3 + 1) * 0.8;
  });

  const wrapH = 3;
  const accentH = 0.3;
  const y = B_H * 0.88;
  const gap = 0.15;

  const faces = [
    { pos: [0, y, B_D / 2 + gap] as const, rot: [0, 0, 0] as const, w: B_W + gap * 2 },
    { pos: [0, y, -B_D / 2 - gap] as const, rot: [0, Math.PI, 0] as const, w: B_W + gap * 2 },
    { pos: [B_W / 2 + gap, y, 0] as const, rot: [0, Math.PI / 2, 0] as const, w: B_D + gap * 2 },
    { pos: [-B_W / 2 - gap, y, 0] as const, rot: [0, -Math.PI / 2, 0] as const, w: B_D + gap * 2 },
  ];

  return (
    <group ref={groupRef}>
      <PreviewBuilding />
      <group position={[0, -B_H / 2, 0]}>
        {faces.map((f, i) => (
          <group key={i}>
            <mesh material={ledMat} position={[f.pos[0], f.pos[1], f.pos[2]]} rotation={[f.rot[0], f.rot[1], f.rot[2]]}>
              <planeGeometry args={[f.w, wrapH]} />
            </mesh>
            <mesh material={accentMat} position={[f.pos[0], f.pos[1] + wrapH / 2 + accentH / 2, f.pos[2]]} rotation={[f.rot[0], f.rot[1], f.rot[2]]}>
              <planeGeometry args={[f.w, accentH]} />
            </mesh>
            <mesh material={accentMat} position={[f.pos[0], f.pos[1] - wrapH / 2 - accentH / 2, f.pos[2]]} rotation={[f.rot[0], f.rot[1], f.rot[2]]}>
              <planeGeometry args={[f.w, accentH]} />
            </mesh>
          </group>
        ))}
        <pointLight position={[0, y, B_D / 2 + 2]} color={color} intensity={1.5} distance={15} />
        <pointLight position={[0, y, -B_D / 2 - 2]} color={color} intensity={1.5} distance={15} />
        <pointLight position={[B_W / 2 + 2, y, 0]} color={color} intensity={1.5} distance={15} />
        <pointLight position={[-B_W / 2 - 2, y, 0]} color={color} intensity={1.5} distance={15} />
      </group>
    </group>
  );
}

// ─── Scene wrapper with lighting + controls ──────────────────

interface AdProps {
  text: string;
  color: string;
  bgColor: string;
}

// Camera positions per vehicle
// Camera: side view for sky ads (banner readable), zoomed into sign for rooftop
const CAM_PRESETS: Record<string, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  plane:        { pos: new THREE.Vector3(55, 2, 25),   target: new THREE.Vector3(0, -7, 30) },
  blimp:        { pos: new THREE.Vector3(45, 3, 10),   target: new THREE.Vector3(0, -2, 0) },
  billboard:    { pos: new THREE.Vector3(15, 20, 55),   target: new THREE.Vector3(0, 18, 0) },
  rooftop_sign: { pos: new THREE.Vector3(30, 38, 70),   target: new THREE.Vector3(0, 35, 0) },
  led_wrap:     { pos: new THREE.Vector3(20, 20, 50),   target: new THREE.Vector3(0, 15, 0) },
};

function AdPreviewScene({ vehicle, text, color, bgColor }: AdProps & { vehicle: string }) {
  const isSky = vehicle === "plane" || vehicle === "blimp";
  const camDist = isSky ? 60 : Math.max(60, B_H * 1.5);
  const preset = CAM_PRESETS[vehicle] ?? CAM_PRESETS.plane;
  const controlsRef = useRef<any>(null);
  const lerpProgress = useRef(1); // 1 = idle, <1 = animating
  const fromPos = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const prevVehicle = useRef(vehicle);
  const { camera } = useThree();

  // Only animate on actual vehicle *change*, not on mount
  useEffect(() => {
    if (prevVehicle.current === vehicle) return;
    prevVehicle.current = vehicle;
    fromPos.current.copy(camera.position);
    if (controlsRef.current) {
      fromTarget.current.copy(controlsRef.current.target);
    }
    lerpProgress.current = 0;
  }, [vehicle, camera]);

  useFrame(() => {
    if (lerpProgress.current >= 1 || !controlsRef.current) return;
    lerpProgress.current = Math.min(1, lerpProgress.current + 0.025);
    const t = 1 - Math.pow(1 - lerpProgress.current, 3); // ease-out cubic
    camera.position.lerpVectors(fromPos.current, preset.pos, t);
    controlsRef.current.target.lerpVectors(fromTarget.current, preset.target, t);
    controlsRef.current.update();
  });

  const props = { text, color, bgColor };

  return (
    <>
      {/* Lighting matching CityCanvas Midnight theme */}
      <ambientLight intensity={0.55 * 3} color={THEME.ambientColor} />
      <directionalLight position={[300, 120, -200]} intensity={0.75 * 3.5} color={THEME.sunColor} />
      <directionalLight position={[-200, 60, 200]} intensity={0.3 * 3} color={THEME.fillColor} />
      <hemisphereLight
        color={THEME.hemiSky}
        groundColor={THEME.hemiGround}
        intensity={0.5 * 3.5}
      />
      <fog attach="fog" args={[THEME.fogColor, 500, 3500]} />

      <OrbitControls
        ref={controlsRef}
        enablePan
        screenSpacePanning
        minDistance={15}
        maxDistance={Math.max(200, camDist * 3)}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI * 0.85}
        target={preset.target.toArray() as [number, number, number]}
      />

      {!isSky && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -B_H / 2, 0]}>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color={THEME.groundColor} emissive={THEME.groundColor} emissiveIntensity={0.15} />
        </mesh>
      )}

      {vehicle === "plane" && <PlanePreviewScene {...props} />}
      {vehicle === "blimp" && <BlimpPreviewScene {...props} />}
      {vehicle === "billboard" && <BillboardPreviewScene {...props} />}
      {vehicle === "rooftop_sign" && <RooftopSignPreviewScene {...props} />}
      {vehicle === "led_wrap" && <LedWrapPreviewScene {...props} />}
    </>
  );
}

// ─── Exported component ──────────────────────────────────────

export default function AdPreview({
  vehicle,
  text,
  color,
  bgColor,
  tall,
}: {
  vehicle: string;
  text: string;
  color: string;
  bgColor: string;
  tall?: boolean;
}) {
  const initPreset = CAM_PRESETS[vehicle] ?? CAM_PRESETS.plane;
  const initPos: [number, number, number] = [initPreset.pos.x, initPreset.pos.y, initPreset.pos.z];
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setContextLost(true);
    });
    canvas.addEventListener("webglcontextrestored", () => {
      setContextLost(false);
    });
  }, []);

  // If context was lost, remount the Canvas after a short delay
  useEffect(() => {
    if (!contextLost) return;
    const timer = setTimeout(() => {
      setCanvasKey((k) => k + 1);
      setContextLost(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [contextLost]);

  return (
    <div className="relative border-[3px] border-border" style={{ backgroundColor: THEME.fogColor }}>
      <div className={tall ? "h-[360px] sm:h-[440px] lg:h-[500px]" : "h-[280px] sm:h-[360px] lg:h-[420px]"}>
        {contextLost ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-pixel text-[10px] text-muted">Reloading preview...</span>
          </div>
        ) : (
          <Canvas
            key={canvasKey}
            camera={{ position: initPos, fov: 45 }}
            dpr={[1, 1.5]}
            gl={{
              antialias: true,
              powerPreference: "default",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.3,
            }}
            onCreated={handleCreated}
          >
            <color attach="background" args={[THEME.fogColor]} />
            <Suspense fallback={null}>
              <AdPreviewScene vehicle={vehicle} text={text} color={color} bgColor={bgColor} />
            </Suspense>
          </Canvas>
        )}
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex flex-col items-center gap-1 pointer-events-none">
        <span className="bg-bg/80 px-2 py-0.5 text-[9px] font-pixel uppercase text-muted">
          Live preview | 实时预览
        </span>
        <span className="bg-bg/80 px-2 py-0.5 text-[9px] font-pixel text-muted normal-case">
          Scroll: zoom · Drag: rotate · Right-drag: move | 滚动：缩放 · 拖动：旋转 · 右键拖动：移动
        </span>
      </div>
    </div>
  );
}
