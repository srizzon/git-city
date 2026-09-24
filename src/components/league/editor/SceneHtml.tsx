"use client";

import { Html } from "@react-three/drei";

/** DOM pinned to a point in the city (the selection toolbar). */
export default function SceneHtml({ position, children }: { position: [number, number, number]; children: React.ReactNode }) {
  return (
    <Html position={position} zIndexRange={[35, 30]} style={{ pointerEvents: "auto" }}>
      {children}
    </Html>
  );
}
