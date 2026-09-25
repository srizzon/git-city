/// <reference lib="webworker" />
// Builds the map's ground geometry off the main thread. Fetches the map itself
// (a cache hit: the page already loaded it) so the main thread never clones it.
import { buildLandArray, buildParkArray, buildRoadArrays } from "./map-geometry";
import type { SFRenderMap } from "./github";

export interface MapGeometryArrays {
  asphalt: Float32Array;
  sidewalk: Float32Array;
  parks: Float32Array;
  land: Float32Array | null;
}

self.onmessage = async (e: MessageEvent<{ url: string }>) => {
  try {
    const map = (await (await fetch(e.data.url)).json()) as SFRenderMap & { meta: { bounds: SFRenderMap["bounds"] } };
    const bounds = map.meta.bounds;
    const { asphalt, sidewalk } = buildRoadArrays(map.roads, 0);
    const parks = buildParkArray(map.parks, 0);
    const land = map.landMask ? buildLandArray(map.landMask, bounds, -0.5) : null;
    const out: MapGeometryArrays = { asphalt, sidewalk, parks, land };
    const transfer = [asphalt.buffer, sidewalk.buffer, parks.buffer, ...(land ? [land.buffer] : [])];
    (self as unknown as Worker).postMessage({ ok: true, out }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
