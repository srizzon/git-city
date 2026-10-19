"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import dynamic from "next/dynamic";
import { generateCityLayout, type CityBuilding, type CityDecoration, type CityPlaza, type DeveloperRecord, type LayoutNorms, type SFRenderMap } from "@/lib/github";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { lotToWorld } from "@/lib/league-city/grid";
import { fetchHomeSnapshot, loadSFMap } from "@/lib/city-snapshot-client";
import { sfRenderMap } from "@/lib/city-sf-layout";
import { beatOf, Transport, type FilmClock } from "@trailer-kit/clock";
import type { Word } from "@trailer-kit/narration";
import Studio from "@trailer-kit/Studio";
import BrasilScene from "@/components/towns/brasil/BrasilScene";
import BrasilReelRig from "@/components/reel/brasil/BrasilReelRig";
import BayReelRig from "@/components/reel/bay/BayReelRig";
import ReelOverlay, { overlayBoxes } from "@/components/reel/ReelOverlay";
import { THEMES } from "@/components/city/theme";
import { brasilWorld, plainBuilding } from "@/lib/towns/brasil-world";
import { BrasilPlacer, layoutFromResidents, type Resident, type UF } from "@/lib/towns/brasil-map";
import { reelOf, type Reel } from "@/lib/reel/film";
import type { ReelSpec } from "@/lib/reel/spec";

// A reel spec played in its world, in the trailer kit's studio, with the
// overlay's words over it. 9:16, exported at --size 1080x1920.
// - brasil: the map as it stood at the spec's asOf (or empty), the example
//   building on the next free lot of its state's capital.
// - bay: the home city from the snapshot the home page loads, the spec's lot
//   dev left out so their lot stands empty until it rises.

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), { ssr: false, loading: () => null });

export interface BrasilData {
  residents: Resident[];
  cityDevs: Record<string, unknown>[];
  example: Record<string, unknown> | null;
  norms: LayoutNorms;
}

export interface ReelStudioProps {
  spec: ReelSpec;
  words: Word[];
  song: string | null;
  /** The Brasil map's data (null for the home city, which loads in the browser). */
  brasil: BrasilData | null;
}

const REEL = `
.reel-916 .tk-wrap { max-width: 1100px; }
.reel-916 .tk-stage { aspect-ratio: 9 / 16; width: auto; height: calc(100vh - 230px); margin: 0 auto; }
.reel-916.tk-recording .tk-stage { width: auto; height: auto; }
`;

interface StageProps {
  spec: ReelSpec;
  reel: Reel;
  clock: FilmClock;
  balloon: RefObject<HTMLDivElement | null>;
}

/** The example building: its own look (items and all), on the lot its state's next dev would get. */
function exampleBuilding(spec: ReelSpec, residents: Resident[], record: Record<string, unknown> | null, norms: LayoutNorms): CityBuilding | null {
  const ex = spec.world.type === "brasil" ? spec.world.example : undefined;
  if (!ex) return null;
  const dev = { id: -1, login: ex.login, uf: ex.uf.toUpperCase() as UF };
  const lot = new BrasilPlacer(residents).place(dev);
  if (!lot) return null;
  const { objects } = brasilWorld(layoutFromResidents([{ dev, ...lot, at: 0 }]), () => ({}) as CityBuilding, 1);
  const own = record ? generateCityLayout([record as unknown as DeveloperRecord], undefined, norms).buildings[0] : null;
  return leagueBuildings(objects, new Map([[-1, own ?? plainBuilding(ex.login)]]))[0] ?? null;
}

function BrasilStage({ spec, reel, clock, balloon, data, children }: StageProps & { data: BrasilData; children: (photoOf: (login: string) => string | null) => ReactNode }) {
  const { residents, cityDevs, example, norms } = data;
  const world = useMemo(() => {
    const layout = layoutFromResidents(residents);
    const records = generateCityLayout(cityDevs as unknown as DeveloperRecord[], undefined, norms).buildings;
    const byRecord = new Map(records.map((b) => [b.loginLower, b]));
    const { objects, byDevId } = brasilWorld(layout, (dev) => byRecord.get(dev.login.toLowerCase()) ?? plainBuilding(dev.login), 1);
    const buildings = leagueBuildings(objects, scaleTownHeights(byDevId));
    return { layout, objects, buildings, byLogin: new Map(buildings.map((b) => [b.loginLower, b])), example: exampleBuilding(spec, residents, example, norms) };
  }, [spec, residents, cityDevs, example, norms]);
  const capitalOf = useCallback(
    (uf: string): [number, number] | null => {
      const c = world.layout.cities.find((x) => x.uf === uf.toUpperCase() && !x.second);
      return c ? lotToWorld(c.center[0], c.center[1]) : null;
    },
    [world.layout],
  );
  const photoOf = useCallback((login: string) => world.byLogin.get(login.toLowerCase())?.avatar_url ?? null, [world.byLogin]);
  return (
    <>
      <div className="absolute inset-0">
        <BrasilScene
          embedded
          cities={world.layout.cities}
          island={world.layout.island}
          objects={world.objects}
          buildings={world.buildings}
          rig={<BrasilReelRig clock={clock} reel={reel} example={world.example} byLogin={world.byLogin} capitalOf={capitalOf} balloon={balloon} />}
        />
      </div>
      {children(photoOf)}
    </>
  );
}

interface Bay {
  buildings: CityBuilding[];
  lot: CityBuilding | null;
  plazas: CityPlaza[];
  decorations: CityDecoration[];
  sfMap: SFRenderMap;
}

function BayStage({ spec, reel, clock, balloon, children }: StageProps & { children: (photoOf: (login: string) => string | null) => ReactNode }) {
  const [city, setCity] = useState<Bay | null | undefined>(undefined);
  const lotLogin = spec.world.type === "bay" ? (spec.world.lot?.toLowerCase() ?? null) : null;
  useEffect(() => {
    Promise.all([fetchHomeSnapshot(), loadSFMap()]).then(
      ([snap, sf]) => {
        const layout = snap?.layout;
        if (!layout || !sf) return setCity(null);
        const lot = lotLogin ? (layout.buildings.find((b) => b.loginLower === lotLogin) ?? null) : null;
        setCity({ buildings: layout.buildings.filter((b) => b !== lot), lot, plazas: layout.plazas, decorations: layout.decorations, sfMap: sfRenderMap(sf) });
      },
      () => setCity(null),
    );
  }, [lotLogin]);
  const byLogin = useMemo(() => new Map((city?.buildings ?? []).map((b) => [b.loginLower, b])), [city]);
  const photoOf = useCallback((login: string) => (byLogin.has(login.toLowerCase()) ? `https://avatars.githubusercontent.com/${login}?s=160` : null), [byLogin]);
  if (city === undefined) return <p className="absolute inset-0 flex items-center justify-center font-pixel text-xs text-muted">Loading the city…</p>;
  if (city === null) return <p className="absolute inset-0 flex items-center justify-center font-pixel text-xs text-muted">No city snapshot here.</p>;
  return (
    <>
      <div className="absolute inset-0">
        <CityCanvas
          embedded
          buildings={city.buildings}
          plazas={city.plazas}
          decorations={city.decorations}
          sfMap={city.sfMap}
          flyMode={false}
          onExitFly={() => {}}
          themeIndex={0}
          skyHour={() => 20.5}
          rig={<BayReelRig clock={clock} reel={reel} buildings={city.buildings} lot={city.lot} colors={THEMES[0].building} balloon={balloon} />}
        />
      </div>
      {children(photoOf)}
    </>
  );
}

export default function ReelStudio({ spec, words, song, brasil }: ReelStudioProps) {
  const reel = useMemo(() => reelOf(spec, words, song), [spec, words, song]);
  const [clock] = useState(() => new Transport(reel.film.beat));
  const balloon = useRef<HTMLDivElement>(null);

  // The export's --report reads this every frame (the safe-zone check).
  useEffect(() => {
    const w = window as Window & { __ggReport?: () => unknown };
    w.__ggReport = () => {
      const stage = document.querySelector<HTMLElement>(".tk-stage");
      return stage ? { t: beatOf(clock), boxes: overlayBoxes(stage) } : null;
    };
    return () => {
      delete w.__ggReport;
    };
  }, [clock]);

  const overlay = (photoOf: (login: string) => string | null) => <ReelOverlay clock={clock} reel={reel} header={spec.header} balloon={balloon} photoOf={photoOf} />;
  const stage = { spec, reel, clock, balloon };

  return (
    <>
      <style>{REEL}</style>
      {/* Nothing in these worlds breaks, so there is nothing to put back on a reset. */}
      <Studio film={reel.film} clock={clock} onReset={() => {}} title={spec.id} className="reel-916">
        {() => (spec.world.type === "bay" ? <BayStage {...stage}>{overlay}</BayStage> : brasil ? <BrasilStage {...stage} data={brasil}>{overlay}</BrasilStage> : null)}
      </Studio>
    </>
  );
}
