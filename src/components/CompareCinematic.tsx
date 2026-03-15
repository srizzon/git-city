"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";

interface CompareCinematicProps {
    buildingA: CityBuilding;
    buildingB: CityBuilding;
    controlsRef: React.RefObject<any>;
    onEnd: () => void;
}

const CINEMATIC_DURATION = 3.5; // seconds

// Smootherstep for cinematic curve interpolation
function introEase(t: number): number {
    const s = Math.max(0, Math.min(1, t));
    return s * s * s * (s * (s * 6 - 15) + 10);
}

export default function CompareCinematic({
    buildingA,
    buildingB,
    controlsRef,
    onEnd,
}: CompareCinematicProps) {
    const { camera } = useThree();
    const elapsed = useRef(0);
    const ended = useRef(false);

    // Pre-allocated vectors
    const _pos = useRef(new THREE.Vector3());
    const _look = useRef(new THREE.Vector3());

    // Build the cinematic path
    const { posCurve, lookCurve, duration } = useMemo(() => {
        const posA = new THREE.Vector3(buildingA.position[0], buildingA.height, buildingA.position[2]);
        const posB = new THREE.Vector3(buildingB.position[0], buildingB.height, buildingB.position[2]);

        // Create a vector from A to B
        const aToB = new THREE.Vector3().subVectors(posB, posA);
        const distance = aToB.length();
        const computedDuration = Math.max(3.5, Math.min(8, distance / 80));

        // Find the midpoint
        const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);

        // Calculate a perpendicular vector (normalized) to create the wide arc
        const perp = new THREE.Vector3(-aToB.z, 0, aToB.x).normalize();

        // The arc pushes out horizontally proportional to their distance
        const arcRadius = Math.max(distance * 0.8, 200);

        // Points for Camera Position
        const posPoints = [
            // Start near Building A
            new THREE.Vector3(posA.x - aToB.x * 0.3, posA.y + 150, posA.z - aToB.z * 0.3),

            // Sweep out to the side
            new THREE.Vector3(midPoint.x + perp.x * arcRadius, midPoint.y + 200, midPoint.z + perp.z * arcRadius),

            // Pass behind Building B
            new THREE.Vector3(posB.x + aToB.x * 0.5, posB.y + 150, posB.z + aToB.z * 0.5),
        ];

        // Points for Camera Look Target
        const lookPoints = [
            // Look at A
            posA.clone(),
            // Look at Midpoint
            midPoint.clone(),
            // Look at B
            posB.clone(),
        ];

        const cPosCurve = new THREE.CatmullRomCurve3(posPoints, false, "centripetal");
        const cLookCurve = new THREE.CatmullRomCurve3(lookPoints, false, "centripetal");

        // Compute arc lengths for constant-speed getPointAt
        cPosCurve.getLength();
        cLookCurve.getLength();

        return { posCurve: cPosCurve, lookCurve: cLookCurve, duration: computedDuration };
    }, [buildingA, buildingB]);

    // Take over OrbitControls temporarily
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.autoRotate = false;
        }
    }, [controlsRef]);

    useFrame((_, delta) => {
        if (ended.current) return;
        elapsed.current += delta;

        const rawT = Math.min(elapsed.current / duration, 1);
        const t = introEase(rawT);

        posCurve.getPointAt(t, _pos.current);
        lookCurve.getPointAt(t, _look.current);

        camera.position.copy(_pos.current);
        if (controlsRef.current) {
            controlsRef.current.target.copy(_look.current);
            controlsRef.current.update();
        } else {
            camera.lookAt(_look.current);
        }

        if (elapsed.current >= duration) {
            ended.current = true;
            onEnd();
        }
    });

    return null;
}
