"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useMemo, useState, useEffect, useCallback, memo } from "react";
import * as THREE from "three";

// ─── Building Data Generation ────────────────────────────────

interface BuildingData {
  x: number;
  z: number;
  height: number;
  width: number;
  depth: number;
  litPct: number;
  windowsPerFloor: number;
  floors: number;
  seed: number;
  customColor: string | null;
}

function seededRand(seed: number): number {
  return ((seed * 16807) % 2147483647) / 2147483647;
}

function generateBuildings(count: number): BuildingData[] {
  const buildings: BuildingData[] = [];

  // Spiral grid like the real project
  const BLOCK_SIZE = 3;
  const CELL_SPACING = 50;
  const STREET_WIDTH = 45;
  const blockSpacing = CELL_SPACING * BLOCK_SIZE + STREET_WIDTH;

  function spiralCoord(index: number): [number, number] {
    if (index === 0) return [0, 0];
    let x = 0, y = 0, dx = 1, dy = 0;
    let segLen = 1, segPassed = 0, turns = 0;
    for (let i = 0; i < index; i++) {
      x += dx; y += dy; segPassed++;
      if (segPassed === segLen) {
        segPassed = 0;
        const tmp = dx; dx = -dy; dy = tmp;
        turns++;
        if (turns % 2 === 0) segLen++;
      }
    }
    return [x, y];
  }

  let idx = 0;
  let blockIdx = 0;

  while (idx < count) {
    const [bx, by] = spiralCoord(blockIdx);
    blockIdx++;

    const blockCenterX = bx * blockSpacing;
    const blockCenterZ = by * blockSpacing;

    for (let r = 0; r < BLOCK_SIZE && idx < count; r++) {
      for (let c = 0; c < BLOCK_SIZE && idx < count; c++) {
        const offsetX = (c - (BLOCK_SIZE - 1) / 2) * CELL_SPACING;
        const offsetZ = (r - (BLOCK_SIZE - 1) / 2) * CELL_SPACING;

        const seed = (idx + 1) * 16807 % 2147483647;
        const r1 = seededRand(seed);
        const r2 = seededRand(seed + 1);
        const r3 = seededRand(seed + 2);
        const r4 = seededRand(seed + 3);

        const height = 20 + r1 * 380;
        const width = 14 + r2 * 22;
        const depth = 12 + r3 * 18;
        const litPct = 0.15 + r4 * 0.8;
        const floors = Math.max(3, Math.floor(height / 6));
        const windowsPerFloor = Math.max(3, Math.floor(width / 5));

        buildings.push({
          x: blockCenterX + offsetX,
          z: blockCenterZ + offsetZ,
          height, width, depth, litPct, windowsPerFloor, floors, seed,
          customColor: null,
        });
        idx++;
      }
    }
  }

  return buildings;
}

// ─── Window Atlas (simplified) ───────────────────────────────

const ATLAS_SIZE = 2048;
const ATLAS_CELL = 8;
const ATLAS_COLS = ATLAS_SIZE / ATLAS_CELL; // 256
const ATLAS_BAND_ROWS = 42;
const ATLAS_LIT_PCTS = [0.2, 0.35, 0.5, 0.65, 0.8, 0.95];

function createAtlas(): THREE.CanvasTexture {
  const WS = 6;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);
  const buf32 = new Uint32Array(imageData.data.buffer);

  // Midnight theme colors
  const faceABGR = 0xff1e1a14; // #141a1e
  const litABGRs = [0xff6ec8e8, 0xff48b8d8, 0xff30a0c0]; // warm yellows in ABGR
  const offABGR = 0xff2a2620; // dark off

  buf32.fill(faceABGR);

  let s = 42;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

  for (let band = 0; band < ATLAS_LIT_PCTS.length; band++) {
    const litPct = ATLAS_LIT_PCTS[band];
    const bandStart = band * ATLAS_BAND_ROWS;
    for (let r = 0; r < ATLAS_BAND_ROWS; r++) {
      const rowY = (bandStart + r) * ATLAS_CELL;
      for (let c = 0; c < ATLAS_COLS; c++) {
        const px = c * ATLAS_CELL;
        const abgr = rand() < litPct
          ? litABGRs[Math.floor(rand() * litABGRs.length)]
          : offABGR;
        for (let dy = 0; dy < WS; dy++) {
          const rowOffset = (rowY + dy) * ATLAS_SIZE + px;
          for (let dx = 0; dx < WS; dx++) {
            buf32[rowOffset + dx] = abgr;
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Custom Shader Material (per-instance UV from atlas) ─────

const instancedVertexShader = /* glsl */ `
  attribute vec4 aUvParams;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vUvParams;
  varying vec3 vViewPos;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vUvParams = aUvParams;

    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vViewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const instancedFragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uRoofColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vUvParams;
  varying vec3 vViewPos;

  void main() {
    vec3 absN = abs(vNormal);
    float isRoof = step(0.5, absN.y);

    // Atlas UV for wall faces
    vec2 atlasUv = vUvParams.xy + vUv * vUvParams.zw;
    vec3 wallColor = texture2D(uAtlas, atlasUv).rgb;

    // Emissive glow for lit windows
    vec3 emissive = wallColor * 1.8;
    vec3 wallFinal = wallColor * 0.3 + emissive;

    // Roof: solid color with slight emissive
    vec3 roofFinal = uRoofColor * 1.8;

    vec3 color = mix(wallFinal, roofFinal, isRoof);

    // Simple directional light
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
    color *= diffuse;

    // Linear fog
    float depth = length(vViewPos);
    float fogFactor = smoothstep(uFogNear, uFogFar, depth);
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── Instanced Mode (NEW APPROACH) ──────────────────────────

function InstancedCity({ buildings }: { buildings: BuildingData[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = buildings.length;

  const atlas = useMemo(() => createAtlas(), []);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uRoofColor: { value: new THREE.Color("#2a1a3e") },
        uFogColor: { value: new THREE.Color("#0a0a14") },
        uFogNear: { value: 800 },
        uFogFar: { value: 5000 },
      },
      vertexShader: instancedVertexShader,
      fragmentShader: instancedFragmentShader,
    });
  }, [atlas]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const uvData = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      pos.set(b.x, b.height / 2, b.z);
      scale.set(b.width, b.height, b.depth);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);

      // Per-instance UV: pick a band + column from atlas
      const bandIndex = Math.min(5, Math.max(0, Math.round(b.litPct * 5)));
      const bandRowOffset = bandIndex * ATLAS_BAND_ROWS;
      const colStart = Math.abs(b.seed % Math.max(1, ATLAS_COLS - b.windowsPerFloor));

      uvData[i * 4 + 0] = colStart / ATLAS_COLS;
      uvData[i * 4 + 1] = bandRowOffset / ATLAS_COLS;
      uvData[i * 4 + 2] = b.windowsPerFloor / ATLAS_COLS;
      uvData[i * 4 + 3] = b.floors / ATLAS_COLS;
    }

    mesh.instanceMatrix.needsUpdate = true;

    const attr = new THREE.InstancedBufferAttribute(uvData, 4);
    mesh.geometry.setAttribute("aUvParams", attr);
  }, [buildings, count]);

  useEffect(() => {
    return () => {
      geo.dispose();
      material.dispose();
      atlas.dispose();
    };
  }, [geo, material, atlas]);

  return (
    <instancedMesh ref={meshRef} args={[geo, material, count]} frustumCulled={false} />
  );
}

// ─── Individual Mode (CURRENT APPROACH simulation) ───────────

const SHARED_GEO = new THREE.BoxGeometry(1, 1, 1);

const IndividualBuilding = memo(function IndividualBuilding({
  b,
  atlas,
}: {
  b: BuildingData;
  atlas: THREE.CanvasTexture;
}) {
  const materials = useMemo(() => {
    const bandIndex = Math.min(5, Math.max(0, Math.round(b.litPct * 5)));
    const bandRowOffset = bandIndex * ATLAS_BAND_ROWS;
    const colStart = Math.abs(b.seed % Math.max(1, ATLAS_COLS - b.windowsPerFloor));

    const front = atlas.clone();
    front.offset.set(colStart / ATLAS_COLS, bandRowOffset / ATLAS_COLS);
    front.repeat.set(b.windowsPerFloor / ATLAS_COLS, b.floors / ATLAS_COLS);

    const side = atlas.clone();
    const sideCol = Math.abs((b.seed + 7919) % Math.max(1, ATLAS_COLS - 3));
    side.offset.set(sideCol / ATLAS_COLS, bandRowOffset / ATLAS_COLS);
    side.repeat.set(3 / ATLAS_COLS, b.floors / ATLAS_COLS);

    const roof = new THREE.MeshStandardMaterial({
      color: "#2a1a3e",
      emissive: new THREE.Color("#2a1a3e"),
      emissiveIntensity: 1.5,
    });
    const makeMat = (tex: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: tex,
        emissiveIntensity: 2.0,
        roughness: 0.85,
      });
    const s = makeMat(side);
    const f = makeMat(front);
    return [s, s, roof, roof, f, f];
  }, [b, atlas]);

  useEffect(() => {
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials]);

  return (
    <mesh
      geometry={SHARED_GEO}
      material={materials}
      position={[b.x, b.height / 2, b.z]}
      scale={[b.width, b.height, b.depth]}
      dispose={null}
    />
  );
});

function IndividualCity({ buildings, atlas }: { buildings: BuildingData[]; atlas: THREE.CanvasTexture }) {
  return (
    <>
      {buildings.map((b, i) => (
        <IndividualBuilding key={i} b={b} atlas={atlas} />
      ))}
    </>
  );
}

// ─── Stats Overlay ───────────────────────────────────────────

function RenderStats({ mode, count }: { mode: string; count: number }) {
  const { gl } = useThree();
  const statsRef = useRef<HTMLDivElement | null>(null);
  const fpsFrames = useRef<number[]>([]);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    // Create stats div in the DOM
    const div = document.getElementById("poc-stats");
    if (div) statsRef.current = div as HTMLDivElement;
  }, []);

  useFrame(() => {
    const now = performance.now();
    const delta = now - lastTime.current;
    lastTime.current = now;

    fpsFrames.current.push(1000 / delta);
    if (fpsFrames.current.length > 60) fpsFrames.current.shift();

    const avgFps = fpsFrames.current.reduce((a, b) => a + b, 0) / fpsFrames.current.length;

    if (statsRef.current) {
      const info = gl.info.render;
      statsRef.current.innerHTML = [
        `<b>FPS:</b> ${avgFps.toFixed(0)}`,
        `<b>Draw Calls:</b> ${info.calls}`,
        `<b>Triangles:</b> ${info.triangles.toLocaleString()}`,
        `<b>Mode:</b> ${mode}`,
        `<b>Buildings:</b> ${count.toLocaleString()}`,
      ].join("<br>");
    }
  });

  return null;
}

// ─── Ground ──────────────────────────────────────────────────

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <planeGeometry args={[20000, 20000]} />
      <meshStandardMaterial
        color="#0a0a14"
        emissive="#0a0a14"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

// ─── Main POC Component ──────────────────────────────────────

export default function CityPOC() {
  const [count, setCount] = useState(1000);
  const [mode, setMode] = useState<"instanced" | "individual">("instanced");
  const [atlas] = useState(() => {
    if (typeof window === "undefined") return null;
    return createAtlas();
  });

  const buildings = useMemo(() => generateBuildings(count), [count]);

  // Cap individual mode to prevent browser crash
  const individualBuildings = useMemo(() => {
    if (mode !== "individual") return [];
    return buildings.slice(0, Math.min(count, 2000));
  }, [buildings, count, mode]);

  const effectiveCount = mode === "individual"
    ? Math.min(count, 2000)
    : count;

  const handleCountChange = useCallback((newCount: number) => {
    setCount(newCount);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a14", position: "relative" }}>
      {/* Controls Panel */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          background: "rgba(10,10,20,0.9)",
          border: "1px solid rgba(200,230,74,0.3)",
          borderRadius: 8,
          padding: 16,
          color: "#e8dcc8",
          fontFamily: '"Silkscreen", monospace',
          fontSize: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minWidth: 220,
        }}
      >
        <div style={{ fontSize: 14, color: "#c8e64a", fontWeight: "bold" }}>
          PERFORMANCE POC
        </div>

        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setMode("instanced")}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: mode === "instanced" ? "#c8e64a" : "rgba(200,230,74,0.1)",
              color: mode === "instanced" ? "#0a0a14" : "#c8e64a",
              border: "1px solid #c8e64a",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: "bold",
            }}
          >
            INSTANCED
          </button>
          <button
            onClick={() => setMode("individual")}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: mode === "individual" ? "#e64a4a" : "rgba(230,74,74,0.1)",
              color: mode === "individual" ? "#fff" : "#e64a4a",
              border: "1px solid #e64a4a",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: "bold",
            }}
          >
            INDIVIDUAL
          </button>
        </div>

        {/* Count Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {[100, 500, 1000, 3000, 5000, 10000].map((n) => (
            <button
              key={n}
              onClick={() => handleCountChange(n)}
              style={{
                padding: "4px 8px",
                background: count === n ? "rgba(200,230,74,0.3)" : "rgba(255,255,255,0.05)",
                color: count === n ? "#c8e64a" : "#888",
                border: `1px solid ${count === n ? "#c8e64a" : "#333"}`,
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 10,
              }}
            >
              {n >= 1000 ? `${n / 1000}k` : n}
            </button>
          ))}
        </div>

        {mode === "individual" && count > 2000 && (
          <div style={{ color: "#e64a4a", fontSize: 10 }}>
            Capped at 2k to prevent crash | 最大显示2000个建筑物，防止崩溃
          </div>
        )}
      </div>

      {/* Stats Overlay */}
      <div
        id="poc-stats"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 10,
          background: "rgba(10,10,20,0.9)",
          border: "1px solid rgba(200,230,74,0.3)",
          borderRadius: 8,
          padding: 16,
          color: "#e8dcc8",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.8,
          minWidth: 200,
        }}
      />

      {/* 3D Canvas */}
      <Canvas
        camera={{ fov: 55, near: 0.5, far: 8000, position: [0, 600, 1200] }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3,
          powerPreference: "high-performance",
        }}
      >
        <fog attach="fog" args={["#0a0a14", 800, 5000]} />
        <ambientLight color="#4466aa" intensity={2.5} />
        <directionalLight position={[200, 400, 200]} color="#aabbff" intensity={3} />
        <directionalLight position={[-100, 300, -200]} color="#6644aa" intensity={1.5} />
        <hemisphereLight color="#334488" groundColor="#0a0a14" intensity={2.5} />

        <Ground />

        {mode === "instanced" && <InstancedCity buildings={buildings} />}
        {mode === "individual" && atlas && (
          <IndividualCity buildings={individualBuildings} atlas={atlas} />
        )}

        <RenderStats mode={mode.toUpperCase()} count={effectiveCount} />

        <OrbitControls
          autoRotate
          autoRotateSpeed={0.3}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={50}
          maxDistance={4000}
          enableDamping
          dampingFactor={0.06}
        />
      </Canvas>
    </div>
  );
}
