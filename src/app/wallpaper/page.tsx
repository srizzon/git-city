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
    const res = await fetch("/api/city");
    if (!res.ok) return;
    const data = await res.json();

    const layout = generateCityLayout(data.developers);
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