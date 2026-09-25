// The loading screen waits for the 3D canvas to actually draw the city once,
// not just for the data: the canvas chunk, shaders and GPU uploads can land
// seconds later on a slow device, and the intro then played over black.
let resolveFrame: (() => void) | null = null;
const framePromise = new Promise<void>((r) => { resolveFrame = r; });

/** Called from inside the canvas once a frame with buildings has rendered. */
export function signalCityFrame() {
  resolveFrame?.();
  resolveFrame = null;
}

/** Resolves on the first city frame, or after `timeoutMs` so loading never hangs. */
export function waitForCityFrame(timeoutMs: number): Promise<void> {
  return Promise.race([framePromise, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
