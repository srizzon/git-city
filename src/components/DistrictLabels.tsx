"use client";

import { Html } from "@react-three/drei";
import type { DistrictZone } from "@/lib/github";

interface DistrictLabelsProps {
  districtZones: DistrictZone[];
  visible: boolean;
}

export default function DistrictLabels({ districtZones, visible }: DistrictLabelsProps) {
  if (!visible) return null;

  return (
    <>
      {districtZones.map((zone) => (
        <group key={zone.id} position={[zone.center[0], 120, zone.center[2]]}>
          <Html
            center
            distanceFactor={400}
            position={[0, 0, 0]}
            style={{
              pointerEvents: "none",
              userSelect: "none",
              transition: "opacity 0.5s",
            }}
          >
            <div
              className="flex flex-col items-center gap-1"
              style={{
                textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
              }}
            >
              <span
                className="whitespace-nowrap font-pixel text-[12px] uppercase tracking-wider"
                style={{ color: zone.color }}
              >
                {zone.name} District
              </span>
              <span className="text-[10px] text-muted normal-case opacity-80">
                {zone.population} developers
              </span>
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}
