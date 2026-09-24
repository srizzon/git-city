import type * as THREE from "three";

// Anything that leaves tire marks, smoke or a boost trail: your car and every
// remote car. Each car keeps its entry up to date every frame.

export interface FxSource {
  /** The visible car, city units. */
  group: THREE.Object3D;
  /** Rear wheel groups (left, right). */
  rearWheels: THREE.Object3D[];
  /** Sideways slip, 0…1. */
  slip: number;
  boosting: boolean;
  /** Rear wheels on the ground. */
  grounded: boolean;
}

export type FxSources = React.MutableRefObject<Map<string, FxSource>>;
