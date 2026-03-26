"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  generateCityLayout,
  type CityBuilding,
  type CityPlaza,
  type CityDecoration,
  type CityRiver,
  type CityBridge,
} from "@/lib/github";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), { ssr: false });

const THEME_MAP: Record<string, number> = {
  midnight: 0,
  sunset: 1,
  neon: 2,
  emerald: 3,
};

function WallpaperInner() {
  const params = useSearchParams();

  const themeParam = params.get("theme") ?? "emerald";
  const themeIndex = THEME_MAP[themeParam] ?? 3;

  const speedParam = params.get("speed");
  const speed = speedParam ? Math.min(0.5, Math.max(0.05, parseFloat(speedParam) || 0.08)) : 0.08;

  const [buildings, setBuildings] = useState<CityBuilding[]>([]);
  const [plazas, setPlazas] = useState<CityPlaza[]>([]);
  const [decorations, setDecorations] = useState<CityDecoration[]>([]);
  const [river, setRiver] = useState<CityRiver | null>(null);
  const [bridges, setBridges] = useState<CityBridge[]>([]);
  const [ready, setReady] = useState(false);

  const fetchCity = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allDevs: any[] = [];

    // Try pre-computed snapshot first
    try {
      const v = Math.floor(Date.now() / 300_000);
      const snapshotUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/city-data/snapshot.json?v=${v}`;
      const snapshotRes = await fetch(snapshotUrl);
      if (snapshotRes.ok) {
        const buf = await snapshotRes.arrayBuffer();
        const ds = new DecompressionStream("gzip");
        const stream = new Blob([buf]).stream().pipeThrough(ds);
        const snapshot = await new Response(stream).json();
        allDevs = snapshot.developers;
      }
    } catch { /* fall through to chunked */ }

    // Fallback to chunked API
    if (allDevs.length === 0) {
      const CHUNK = 1000;
      const res = await fetch(`/api/city?from=0&to=${CHUNK}`);
      if (!res.ok) return;
      const data = await res.json();
      allDevs = data.developers ?? [];

      const total = data.stats?.total_developers ?? allDevs.length;
      if (total > CHUNK) {
        const promises: Promise<{ developers: typeof allDevs } | null>[] = [];
        for (let from = CHUNK; from < total; from += CHUNK) {
          promises.push(
            fetch(`/api/city?from=${from}&to=${from + CHUNK}`)
              .then((r) => (r.ok ? r.json() : null))
          );
        }
        const chunks = await Promise.all(promises);
        for (const chunk of chunks) {
          if (chunk) allDevs = [...allDevs, ...chunk.developers];
        }
      }
    }

    if (allDevs.length === 0) return;

    const layout = generateCityLayout(allDevs);
    setBuildings(layout.buildings);
    setPlazas(layout.plazas);
    setDecorations(layout.decorations);
    setRiver(layout.river);
    setBridges(layout.bridges);
    setReady(true);
  }, []);

  useEffect(() => {
    fetchCity();
  }, [fetchCity]);

  if (!ready) return null;

  return (
    <CityCanvas
      buildings={buildings}
      plazas={plazas}
      decorations={decorations}
      river={river}
      bridges={bridges}
      flyMode={false}
      onExitFly={() => {}}
      themeIndex={themeIndex}
      introMode={false}
      wallpaperMode
      wallpaperSpeed={speed}
    />
  );
}

export default function WallpaperPage() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "none", overflow: "hidden" }}>
      <Suspense fallback={null}>
        <WallpaperInner />
      </Suspense>
    </div>
  );
}