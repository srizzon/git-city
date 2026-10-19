"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateCityLayout, type CityBuilding, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { lotToWorld } from "@/lib/league-city/grid";
import { beatOf, Transport } from "@trailer-kit/clock";
import type { Word } from "@trailer-kit/narration";
import Studio from "@trailer-kit/Studio";
import BrasilScene from "@/components/towns/brasil/BrasilScene";
import BrasilReelRig from "@/components/reel/brasil/BrasilReelRig";
import ReelOverlay, { overlayBoxes } from "@/components/reel/ReelOverlay";
import { brasilWorld, plainBuilding } from "@/lib/towns/brasil-world";
import { BrasilPlacer, layoutFromResidents, type Resident, type UF } from "@/lib/towns/brasil-map";
import { reelOf } from "@/lib/reel/film";
import type { ReelSpec } from "@/lib/reel/spec";

// A reel spec played in its world, in the trailer kit's studio: the Brasil
// map as it stood at the spec's asOf (or empty), the reel's rig as its
// camera, the example building on the next free lot of its state's capital,
// and the overlay's words over it. 9:16, exported at --size 1080x1920.

export interface ReelStudioProps {
  spec: ReelSpec;
  words: Word[];
  song: string | null;
  residents: Resident[];
  cityDevs: Record<string, unknown>[];
  example: Record<string, unknown> | null;
  norms: LayoutNorms;
}

const REEL = `
.reel-916 .tk-wrap { max-width: 1100px; }
.reel-916 .tk-stage { aspect-ratio: 9 / 16; width: auto; height: calc(100vh - 230px); margin: 0 auto; }
.reel-916.tk-recording .tk-stage { width: auto; height: auto; }
`;

/** The example building: its own look (items and all), on the lot its state's next dev would get. */
function exampleBuilding(spec: ReelSpec, residents: Resident[], record: Record<string, unknown> | null, norms: LayoutNorms): CityBuilding | null {
  const ex = spec.world.example;
  if (!ex) return null;
  const dev = { id: -1, login: ex.login, uf: ex.uf.toUpperCase() as UF };
  const lot = new BrasilPlacer(residents).place(dev);
  if (!lot) return null;
  const { objects } = brasilWorld(layoutFromResidents([{ dev, ...lot, at: 0 }]), () => ({}) as CityBuilding, 1);
  const own = record ? generateCityLayout([record as unknown as DeveloperRecord], undefined, norms).buildings[0] : null;
  return leagueBuildings(objects, new Map([[-1, own ?? plainBuilding(ex.login)]]))[0] ?? null;
}

export default function ReelStudio({ spec, words, song, residents, cityDevs, example, norms }: ReelStudioProps) {
  const reel = useMemo(() => reelOf(spec, words, song), [spec, words, song]);
  const [clock] = useState(() => new Transport(reel.film.beat));
  const balloon = useRef<HTMLDivElement>(null);
  const world = useMemo(() => {
    const layout = layoutFromResidents(residents);
    const records = generateCityLayout(cityDevs as unknown as DeveloperRecord[], undefined, norms).buildings;
    const byRecord = new Map(records.map((b) => [b.loginLower, b]));
    const { objects, byDevId } = brasilWorld(layout, (dev) => byRecord.get(dev.login.toLowerCase()) ?? plainBuilding(dev.login), 1);
    const buildings = leagueBuildings(objects, scaleTownHeights(byDevId));
    return {
      layout,
      objects,
      buildings,
      byLogin: new Map(buildings.map((b) => [b.loginLower, b])),
      example: exampleBuilding(spec, residents, example, norms),
    };
  }, [spec, residents, cityDevs, example, norms]);
  const capitalOf = useCallback(
    (uf: string): [number, number] | null => {
      const c = world.layout.cities.find((x) => x.uf === uf.toUpperCase() && !x.second);
      return c ? lotToWorld(c.center[0], c.center[1]) : null;
    },
    [world.layout],
  );
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
  const photoOf = useCallback((login: string) => world.byLogin.get(login.toLowerCase())?.avatar_url ?? null, [world.byLogin]);

  return (
    <>
      <style>{REEL}</style>
      {/* Nothing in the map breaks, so there is nothing to put back on a reset. */}
      <Studio film={reel.film} clock={clock} onReset={() => {}} title={spec.id} className="reel-916">
        {() => (
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
            <ReelOverlay clock={clock} reel={reel} header={spec.header} balloon={balloon} photoOf={photoOf} />
          </>
        )}
      </Studio>
    </>
  );
}
