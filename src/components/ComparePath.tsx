"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { CityBuilding } from "@/lib/github";

interface ComparePathProps {
    buildings: CityBuilding[];
    focusedBuilding: string | null;
    focusedBuildingB: string | null;
    accentColor: string;
}

export default function ComparePath({
    buildings,
    focusedBuilding,
    focusedBuildingB,
    accentColor,
}: ComparePathProps) {
    const lineMaterialRef = useRef<any>(null);

    // Animate the line dash offset to make it look like data flowing
    useFrame((state, delta) => {
        if (lineMaterialRef.current) {
            // Flow from A to B
            lineMaterialRef.current.dashOffset -= delta * 15;
        }
    });

    const pathResult = useMemo(() => {
        if (!focusedBuilding || !focusedBuildingB) return null;

        const bA = buildings.find((b) => b.login.toLowerCase() === focusedBuilding.toLowerCase());
        const bB = buildings.find((b) => b.login.toLowerCase() === focusedBuildingB.toLowerCase());

        if (!bA || !bB) return null;

        // Start near the top of building A
        const startPoint = new THREE.Vector3(bA.position[0], bA.height + 5, bA.position[2]);
        // End near the top of building B
        const endPoint = new THREE.Vector3(bB.position[0], bB.height + 5, bB.position[2]);

        const distance = startPoint.distanceTo(endPoint);

        // Draw an arc rising into the sky between them
        // The height of the arc is proportional to the distance, but capped
        const arcHeight = Math.min(Math.max(distance * 0.4, 50), 300);

        const midPoint = new THREE.Vector3()
            .addVectors(startPoint, endPoint)
            .multiplyScalar(0.5);

        // Control point for a quadratic bezier curve
        const controlPoint = new THREE.Vector3(
            midPoint.x,
            Math.max(startPoint.y, endPoint.y) + arcHeight,
            midPoint.z
        );

        const curve = new THREE.QuadraticBezierCurve3(startPoint, controlPoint, endPoint);

        // Generate 64 points along the curve
        const points = curve.getPoints(64);

        return { points, distance };
    }, [buildings, focusedBuilding, focusedBuildingB]);

    if (!pathResult) return null;

    return (
        <group>
            <Line
                points={pathResult.points}
                color={accentColor}
                lineWidth={3}     // Width of the line
                dashed={true}
                dashSize={10}     // Size of the solid dashes
                gapSize={5}       // Size of the gaps
                dashScale={1}
                transparent={true}
                opacity={0.8}
                // Expose ref so we can animate dashOffset
                ref={(mat: any) => {
                    if (mat?.material) {
                        lineMaterialRef.current = mat.material;
                    }
                }}
            />
        </group>
    );
}
