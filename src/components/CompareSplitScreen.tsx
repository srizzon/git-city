"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree, createPortal } from "@react-three/fiber";
import * as THREE from "three";
import { Html, OrbitControls } from "@react-three/drei";
import type { CityBuilding } from "@/lib/github";

interface CompareSplitScreenProps {
    buildingA: CityBuilding;
    buildingB: CityBuilding;
}

export default function CompareSplitScreen({ buildingA, buildingB }: CompareSplitScreenProps) {
    const { size, scene } = useThree();

    // Create a virtual camera for Building A (Left side)
    const virtualCamA = useMemo(() => {
        const cam = new THREE.PerspectiveCamera(55, size.width / 2 / size.height, 0.5, 15000);
        cam.position.set(buildingA.position[0], buildingA.height + 200, buildingA.position[2] + 400);
        return cam;
    }, [buildingA, size.width, size.height]);

    // Create a virtual camera for Building B (Right side)
    const virtualCamB = useMemo(() => {
        const cam = new THREE.PerspectiveCamera(55, size.width / 2 / size.height, 0.5, 15000);
        cam.position.set(buildingB.position[0], buildingB.height + 200, buildingB.position[2] + 400);
        return cam;
    }, [buildingB, size.width, size.height]);

    // Target positions for the cameras to orbit around
    const targetA = useMemo(() => new THREE.Vector3(buildingA.position[0], buildingA.height * 0.7, buildingA.position[2]), [buildingA]);
    const targetB = useMemo(() => new THREE.Vector3(buildingB.position[0], buildingB.height * 0.7, buildingB.position[2]), [buildingB]);

    // Update aspect ratios when canvas size changes
    useEffect(() => {
        const aspect = (size.width / 2) / size.height;
        virtualCamA.aspect = aspect;
        virtualCamA.updateProjectionMatrix();

        virtualCamB.aspect = aspect;
        virtualCamB.updateProjectionMatrix();
    }, [size, virtualCamA, virtualCamB]);

    // Render loop override to draw the scene twice with scissors
    useFrame((state) => {
        const { gl, scene } = state;

        // Ensure proper clears, we clear once manually
        gl.autoClear = false;
        gl.clear();

        // 1. Left Viewport (Building A)
        gl.setViewport(0, 0, size.width / 2, size.height);
        gl.setScissor(0, 0, size.width / 2, size.height);
        gl.setScissorTest(true);
        gl.setClearColor(0x000000, 0); // Transparent/fog matches main background

        virtualCamA.lookAt(targetA);
        gl.render(scene, virtualCamA);

        // 2. Right Viewport (Building B)
        gl.setViewport(size.width / 2, 0, size.width / 2, size.height);
        gl.setScissor(size.width / 2, 0, size.width / 2, size.height);
        gl.setScissorTest(true);

        virtualCamB.lookAt(targetB);
        gl.render(scene, virtualCamB);

        // Reset to full screen for other passes (e.g. bloom) if necessary
        gl.setViewport(0, 0, size.width, size.height);
        gl.setScissor(0, 0, size.width, size.height);
        gl.setScissorTest(false);
        gl.autoClear = true;

    }, 1); // priority 1 to hijack the render loop

    // The two scenes will render using gl, but we need HTML for the dividing bar
    return (
        <>
            <Html center position={[0, 0, 0]} zIndexRange={[100, 0]}>
                <div
                    style={{
                        position: "fixed",
                        top: "-50vh",
                        left: 0,
                        width: "2px",
                        height: "100vh",
                        backgroundColor: "rgba(255, 255, 255, 0.2)",
                        boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
                        transform: "translateX(-50%)",
                        pointerEvents: "none",
                        zIndex: 50,
                    }}
                />
            </Html>
            {createPortal(
                <OrbitControls
                    camera={virtualCamA}
                    target={targetA}
                    makeDefault={false}
                    enableDamping
                    dampingFactor={0.05}
                    autoRotate
                    autoRotateSpeed={0.5}
                    minDistance={50}
                    maxDistance={1000}
                    maxPolarAngle={Math.PI / 2.1}
                />,
                scene // Note: orbit controls must be in scene
            )}
            {createPortal(
                <OrbitControls
                    camera={virtualCamB}
                    target={targetB}
                    makeDefault={false}
                    enableDamping
                    dampingFactor={0.05}
                    autoRotate
                    autoRotateSpeed={0.5}
                    minDistance={50}
                    maxDistance={1000}
                    maxPolarAngle={Math.PI / 2.1}
                />,
                scene
            )}
        </>
    );
}
