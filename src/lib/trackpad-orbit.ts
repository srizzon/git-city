import * as THREE from "three";
import type { OrbitControls } from "three-stdlib";

// Trackpad navigation on top of the explore OrbitControls (Google Earth on a
// Mac): a two-finger swipe turns and tilts the camera, a Safari twist turns it.
// Pinches (ctrl+wheel) and real mouse wheels go on to OrbitControls and zoom.
// Returns the cleanup.
export function attachTrackpadOrbit(el: HTMLElement, getControls: () => OrbitControls | null): () => void {
  const offset = new THREE.Vector3();
  const sph = new THREE.Spherical();

  // Turn by dTheta and tilt by dPhi (radians) around the target, moving the
  // camera directly: the controls' own rotate state is private in three-stdlib.
  const orbit = (c: OrbitControls, dTheta: number, dPhi: number) => {
    // three-stdlib types the event with a target that dispatchEvent fills in itself.
    c.dispatchEvent({ type: "start" } as Parameters<typeof c.dispatchEvent>[0]);
    offset.copy(c.object.position).sub(c.target);
    sph.setFromVector3(offset);
    sph.theta += dTheta;
    sph.phi = Math.max(Math.max(1e-3, c.minPolarAngle), Math.min(c.maxPolarAngle, sph.phi + dPhi));
    c.object.position.setFromSpherical(sph).add(c.target);
    c.object.lookAt(c.target);
    c.update();
    c.dispatchEvent({ type: "end" } as Parameters<typeof c.dispatchEvent>[0]);
  };

  let lastWheelAt = 0;
  let lastWasTrackpad = false;
  const isTrackpad = (e: WheelEvent) => {
    const now = performance.now();
    const sameGesture = now - lastWheelAt < 150;
    lastWheelAt = now;
    // A swipe's momentum tail keeps the verdict of its first event.
    if (sameGesture) return lastWasTrackpad;
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    // Mouse-wheel signatures first (Mapbox GL's rules): line/page deltas, Mac
    // Chrome/Safari notches in multiples of 4.000244140625px, and legacy
    // wheelDelta in whole 120 notches. A vertical-only event matching any of
    // them is a wheel, so it zooms instead of tilting.
    const mouseNotch =
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && e.deltaY !== 0 && (
        e.deltaY % 4.000244140625 === 0 ||
        (legacy !== undefined && legacy !== 0 && legacy % 120 === 0)
      ));
    lastWasTrackpad = !mouseNotch && (
      e.deltaX !== 0 ||
      (legacy !== undefined && legacy !== 0 ? legacy === -3 * e.deltaY : !Number.isInteger(e.deltaY))
    );
    return lastWasTrackpad;
  };

  const onWheel = (e: WheelEvent) => {
    const c = getControls();
    if (!c || !c.enabled || e.ctrlKey || !isTrackpad(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Same feel as a drag: a swipe the height of the canvas is a full turn.
    const k = (2 * Math.PI * c.rotateSpeed) / Math.max(1, el.clientHeight);
    orbit(c, e.deltaX * k, e.deltaY * k);
  };

  let lastRotation = 0;
  const rotationOf = (e: Event) => (e as Event & { rotation?: number }).rotation ?? 0;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    lastRotation = rotationOf(e);
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const c = getControls();
    const d = rotationOf(e) - lastRotation;
    lastRotation = rotationOf(e);
    if (!c || !c.enabled || d === 0) return;
    orbit(c, (d * Math.PI) / 180, 0);
  };

  // Capture on the canvas runs before OrbitControls' own wheel listener.
  el.addEventListener("wheel", onWheel, { passive: false, capture: true });
  el.addEventListener("gesturestart", onGestureStart);
  el.addEventListener("gesturechange", onGestureChange);
  return () => {
    el.removeEventListener("wheel", onWheel, { capture: true });
    el.removeEventListener("gesturestart", onGestureStart);
    el.removeEventListener("gesturechange", onGestureChange);
  };
}
