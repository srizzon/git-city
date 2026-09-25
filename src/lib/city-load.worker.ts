/// <reference lib="webworker" />
// Home-page city build, off the main thread: gunzip + parse + decode the v2
// snapshot and run the SF layout (~1.5s of main-thread work on a mid-range
// phone), so the loading screen keeps animating and the work overlaps React
// hydration instead of following it.
import { decodeSnapshotV2, type SnapshotV2 } from "./city-snapshot-format";
import { generateSFCityLayout } from "./city-sf-layout";
import type { DeveloperRecord, SFMapAsset } from "./github";

export interface CityWorkerRequest {
  snapshot: ArrayBuffer; // gzipped v2 snapshot bytes (transferred)
  sf: SFMapAsset;
  loadoutOverride: { developerId: number; loadout: DeveloperRecord["loadout"] } | null;
}

self.onmessage = async (e: MessageEvent<CityWorkerRequest>) => {
  try {
    const { snapshot, sf, loadoutOverride } = e.data;
    const stream = new Blob([snapshot]).stream().pipeThrough(new DecompressionStream("gzip"));
    // Parsed from text so the text itself can go back to the page: cloning an
    // 18 MB string is a copy, cloning 87k decoded records took ~0.5-1 s.
    const text = await new Response(stream).text();
    const raw = JSON.parse(text) as SnapshotV2;
    if (raw?.v !== 2) throw new Error("not a v2 snapshot");
    const decoded = decodeSnapshotV2(raw);
    if (loadoutOverride) {
      const dev = decoded.developers.find((d) => d.id === loadoutOverride.developerId);
      if (dev) dev.loadout = loadoutOverride.loadout;
    }
    // No lots in this city (a failed seed): the greedy layout needs the SF
    // footprints, which bay.json no longer ships.
    if (sf.footprints.length === 0 && !decoded.developers.some((d) => d.lot)) {
      try {
        sf.footprints = ((await (await fetch("/maps/sf.json")).json()) as SFMapAsset).footprints;
      } catch { /* places nobody */ }
    }
    // sfMap is a projection of the asset the main thread already holds.
    const { sfMap: _omit, ...layout } = generateSFCityLayout(decoded.developers, sf, decoded.norms);
    void _omit;
    const { developers: _devs, ...meta } = decoded;
    void _devs;
    self.postMessage({ ok: true, meta: { ...meta, count: decoded.developers.length }, text, layout });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
