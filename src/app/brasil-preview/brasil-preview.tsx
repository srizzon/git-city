"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CityBuilding } from "@/lib/github";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { createTelemetry } from "@/lib/league-city/drive/telemetry";
import { smashStoreFor } from "@/lib/league-city/smash";
import type { CrownApi } from "@/components/league/drive/CrownMode";
import BrasilScene, { type CameraApi } from "@/components/towns/brasil/BrasilScene";
import { brasilWorld } from "@/lib/towns/brasil-world";
import { STATES, capitalIbge, layoutBrasil, ranking, type CityLayout, type MapDev, type UF } from "@/lib/towns/brasil-map";
import { CITIES } from "@/lib/towns/br-cities";

// The Brasil town with made-up devs: pick how many came (the day of the
// series), watch the cities grow, click a tag to fly there, drive it. Devs
// follow each state's population (a bit steeper, like where devs are), most
// in its capital, many in a handful of its other cities, a few anywhere in
// it; some never say their city and land on the island. The page loads this whole
// file client-side (one bundle with the scene: one three.js).

const STEPS = [0, 12, 60, 250, 800, 2000, 5000];
const ISLAND_SHARE = 0.12;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const BY_UF = new Map<UF, number[]>();
for (const c of CITIES) BY_UF.set(c.uf, [...(BY_UF.get(c.uf) ?? []), c.ibge]);

/** n made-up devs in the order they came, each in a city of a state by population (or on the island). */
function fakeDevs(n: number, seed: number): (MapDev & { city: number | null })[] {
  const rand = rng(seed);
  const weights = STATES.map((s) => s.pop ** 1.25);
  const total = weights.reduce((a, b) => a + b, 0);
  const pick = (): UF => {
    let r = rand() * total;
    for (let i = 0; i < STATES.length; i++) if ((r -= weights[i]) <= 0) return STATES[i].uf;
    return "SP";
  };
  return Array.from({ length: n }, (_, i) => {
    const login = `dev-${(i + 1).toString(36)}`;
    if (rand() < ISLAND_SHARE) return { id: -(i + 1), login, uf: null, city: null };
    const uf = pick();
    const all = BY_UF.get(uf)!;
    const r = rand();
    // Most in the capital; many in a few of the state's other cities (its dev hubs); a few anywhere.
    const city = r < 0.45 ? capitalIbge(uf) : r < 0.8 ? all[Math.floor(rand() * Math.min(all.length, 8)) * 37 % all.length] : all[Math.floor(rand() * all.length)];
    return { id: -(i + 1), login, uf, city };
  });
}

export default function BrasilPreview() {
  // ?n=10000 opens at that many devs, ?stats=1 shows fps and draw calls.
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 2;
    const i = STEPS.indexOf(Number(new URLSearchParams(window.location.search).get("n")));
    return i >= 0 ? i : 2;
  });
  const [stats] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("stats"));
  const [seed, setSeed] = useState(7);
  const [driving, setDriving] = useState(false);
  const [focus, setFocus] = useState<UF | null>(null);
  const camera = useRef<CameraApi | null>(null);
  const telemetry = useMemo(() => createTelemetry(), []);
  const crownApi = useRef<CrownApi | null>(null);
  const n = STEPS[step];

  const world = useMemo(() => {
    const layout = layoutBrasil(fakeDevs(n, seed));
    const rand = rng(seed * 31 + n);
    // Made-up contributions: most devs small, a few towers; founders a bit above the rest.
    const { objects, byDevId } = brasilWorld(
      layout,
      (dev, founder) => {
        const height = 16 + Math.floor(rand() * rand() * rand() * 200) + (founder ? 40 : 0);
        const width = 22 + Math.floor(rand() * 4) * 4;
        return {
          login: dev.login,
          loginLower: dev.login,
          position: [0, 0, 0],
          width,
          depth: width,
          height,
          floors: Math.max(3, Math.floor(height / 6)),
          windowsPerFloor: Math.max(3, Math.floor(width / 5)),
          sideWindowsPerFloor: Math.max(3, Math.floor(width / 5)),
          litPercentage: 0.3 + rand() * 0.6,
        } as unknown as CityBuilding;
      },
      seed,
    );
    const buildings = leagueBuildings(objects, scaleTownHeights(byDevId));
    const top = ranking(layout);
    const founded = layout.cities.filter((c) => c.devs.length > 0).length;
    return { layout, objects, buildings, founded, top: top.slice(0, 3) };
  }, [n, seed]);

  const smash = useMemo(() => smashStoreFor(world.buildings), [world.buildings]);
  const noop = useCallback(() => {}, []);
  // The car starts by the founder of the state in view (or the biggest one).
  const driveFrom = useMemo(() => {
    const city = world.layout.cities.find((c) => c.uf === focus && c.capital && c.devs.length > 0) ?? world.layout.cities.find((c) => c.uf === world.top[0]?.uf && c.capital);
    return city?.devs[0]?.dev.id ?? null;
  }, [world, focus]);
  const drive = useMemo(
    () => ({
      offline: true,
      viewerDevId: driveFrom,
      telemetry,
      camera: "chase" as const,
      onCameraToggle: noop,
      muted: false,
      paused: false,
      stallAt: null,
      onReady: noop,
      onFail: () => setDriving(false),
      slug: "preview-brasil",
      name: "guest",
      onDrivers: noop,
      onHonk: noop,
      crownApi,
      onCrown: noop,
    }),
    [telemetry, noop, driveFrom],
  );

  const onTag = useCallback((c: CityLayout) => {
    setFocus(c.uf);
    camera.current?.flyTo(c.center, c.radius);
  }, []);

  return (
    <main className="fixed inset-0 bg-bg font-pixel uppercase text-cream">
      <BrasilScene
        stats={stats}
        key={`${n}-${seed}`}
        scale={world.layout.scale}
        cities={world.layout.cities}
        island={world.layout.island}
        objects={world.objects}
        buildings={world.buildings}
        cameraApi={camera}
        onTag={onTag}
        drive={driving && driveFrom !== null ? drive : undefined}
        smash={smash}
      />

      {/* The series' counter, as an episode would show it */}
      <div className="pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 flex-col items-center gap-1 text-center">
        <span className="bg-bg/85 px-4 py-2 text-2xl text-lime">{n.toLocaleString("en-US")} devs</span>
        <span className="bg-bg/85 px-3 py-1 text-[11px] text-muted">
          {world.founded} cities · {world.layout.island.devs.length} on the island · {world.layout.scale}x
        </span>
      </div>

      {world.top.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-5 flex flex-col gap-1 text-[11px]">
          {world.top.map((t, i) => (
            <span key={t.uf} className={`flex justify-between gap-4 px-3 py-1 ${i === 0 ? "bg-lime text-bg" : "bg-[#141417] text-cream"}`}>
              <span>
                {i + 1}º {t.uf}
              </span>
              <span>{t.devs}</span>
            </span>
          ))}
        </div>
      )}

      {/* Preview controls */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 text-[11px]">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setDriving(false);
              setStep(i);
            }}
            className={`px-3 py-2 ${i === step ? "bg-lime text-bg" : "bg-[#141417] text-cream hover:text-lime"}`}
          >
            {s === 0 ? "Day 1" : `${s} devs`}
          </button>
        ))}
        <button type="button" onClick={() => setSeed((v) => v + 1)} className="bg-[#141417] px-3 py-2 text-cream hover:text-lime">
          Shuffle
        </button>
        <button
          type="button"
          onClick={() => {
            setDriving(false);
            setFocus(null);
            camera.current?.flyTo(null);
          }}
          className="bg-[#141417] px-3 py-2 text-cream hover:text-lime"
        >
          Brazil
        </button>
        <button type="button" disabled={driveFrom === null} onClick={() => setDriving((d) => !d)} className="bg-cream px-3 py-2 text-bg disabled:opacity-40">
          {driving ? "Stop" : focus ? `Drive ${focus}` : "Drive"}
        </button>
      </div>
    </main>
  );
}
