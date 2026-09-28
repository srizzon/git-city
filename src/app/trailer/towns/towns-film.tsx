"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  generateCityLayout,
  type CityBuilding,
  type DeveloperRecord,
  type LayoutNorms,
} from "@/lib/github";
import type { LeagueCity } from "@/lib/league-city/service";
import type { CityObject } from "@/lib/league-city/types";
import { LOT } from "@/lib/league-city/grid";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { smashStoreFor } from "@/lib/league-city/smash";
import { Transport } from "@trailer-kit/clock";
import type { Film, Frame } from "@trailer-kit/film";
import { BLASTS, FILM, shotFor, smashRun, type Stage } from "@/lib/trailer/towns/teaser";
import Studio from "@trailer-kit/Studio";
import TownsRig from "@/components/trailer/towns/TownsRig";
import EndCard from "@/components/trailer/towns/EndCard";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), {
  ssr: false,
  loading: () => null,
});

// The Towns teaser (lib/trailer/towns/teaser) in the studio: both rivalry
// towns, each its own canvas that never remounts. A cut only changes which
// one shows, and a split shows the middle half of each. The shots are
// TownsRig's; the end card is EndCard's. Everything reads the same clock.

export interface TownSide {
  slug: string;
  name: string;
  color: string;
  city: LeagueCity;
  cityDevs: Record<string, unknown>[];
}

function useTown(side: TownSide, cityNorms: LayoutNorms, gen: number) {
  const base = useMemo(() => {
    const devs = side.cityDevs as unknown as DeveloperRecord[];
    const layout = generateCityLayout(devs, undefined, cityNorms);
    const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
    const byDevId = new Map<number, CityBuilding>();
    for (const d of devs) {
      const b = byLogin.get(d.github_login.toLowerCase());
      if (b) byDevId.set(d.id, b);
    }
    const real = leagueBuildings(side.city.objects, scaleTownHeights(byDevId));
    const run = real.length ? smashRun(side.city.objects, side.city.h, real[0]) : null;
    const buildings = run ? [...real, ...run.buildings] : real;
    const portal = side.city.objects.find((o) => o.item_type === "portal");
    return { buildings, run, gateZ: portal?.pz ?? 24, revZ: plainStreet(side.city.objects) };
  }, [side, cityNorms]);
  // A fresh store puts every building back up (a new take, a loop, a seek back).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => smashStoreFor(base.buildings), [base, gen]);
  return { ...base, store };
}

/** Props on the road that would sit in the burnout shot (pads, bumps, ramps). */
const ON_ROAD = new Set([
  "boost_pad",
  "speed_bump",
  "ramp",
  "ramp_big",
  "cone",
  "tire_wall",
  "crates",
]);

/** A lot row on the main street near the entrance with nothing on the road, as a world z. */
function plainStreet(objects: readonly CityObject[]): number {
  for (let z = -2; z >= -12; z--) {
    const busy = objects.some(
      (o) =>
        o.item_type !== null &&
        ON_ROAD.has(o.item_type) &&
        Math.abs(o.x) <= 1 &&
        Math.abs(o.z - z) <= 1,
    );
    if (!busy) return z * LOT;
  }
  return -2 * LOT;
}

/** Another film in the same towns (the launch trailer): its data, its shots, and its end card. */
export interface TownsCut {
  film: Film<Stage>;
  shotFor: typeof shotFor;
  blasts: readonly number[];
  endCard: (clock: Transport) => ReactNode;
  /** The studio's title. */
  title?: string;
}

const TEASER: TownsCut = {
  film: FILM,
  shotFor,
  blasts: BLASTS,
  endCard: (clock) => <EndCard clock={clock} />,
};

export default function TownsFilm({
  sides,
  cityNorms,
  cut = TEASER,
}: {
  sides: [TownSide, TownSide];
  cityNorms: LayoutNorms;
  cut?: TownsCut;
}) {
  const [claudeSide, codexSide] = sides;
  // A new take (or a loop, or a seek back) rebuilds the smash stores, so every building is back up.
  const [gen, setGen] = useState(0);
  const reset = useCallback(() => setGen((g) => g + 1), []);
  const claude = useTown(claudeSide, cityNorms, gen);
  const codex = useTown(codexSide, cityNorms, gen);
  const [clock] = useState(() => new Transport(cut.film.beat));

  const town = (stage: Stage, frame: Frame<Stage>) => {
    const side = stage === "claude" ? claudeSide : codexSide;
    const other = stage === "claude" ? codexSide : claudeSide;
    const t = stage === "claude" ? claude : codex;
    const split = frame.kind === "split";
    const show = split || (frame.kind === "full" && frame.stage === stage);
    return (
      <div
        className="absolute inset-y-0 overflow-hidden"
        style={
          split
            ? { left: stage === "claude" ? 0 : "50%", width: "50%" }
            : { left: 0, width: "100%", visibility: show ? "visible" : "hidden" }
        }
      >
        {/* Split: each half shows the middle of its town's full-width picture. */}
        <div
          className="absolute inset-y-0"
          style={split ? { left: "-50%", width: "200%" } : { left: 0, width: "100%" }}
        >
          <LeagueScene
            embedded
            cinematic
            dpr={2}
            framing={{ zoom: 1, shiftPx: 0 }}
            h={side.city.h}
            identity={side.city.identity}
            name={side.name}
            objects={side.city.objects}
            buildings={t.buildings}
            mode="view"
            smash={{ store: t.store, color: side.color, rivalLogoUrl: other.city.identity.logoUrl }}
          >
            <TownsRig
              stage={stage}
              clock={clock}
              h={side.city.h}
              gateZ={t.gateZ}
              revZ={t.revZ}
              run={t.run}
              store={t.store}
              homeColor={side.color}
              rivalColor={other.color}
              attacker={other.name}
              shotFor={cut.shotFor}
              blasts={cut.blasts}
            />
          </LeagueScene>
        </div>
      </div>
    );
  };

  return (
    <Studio film={cut.film} clock={clock} onReset={reset} title={cut.title ?? "Towns teaser"}>
      {(frame) => (
        <>
          {town("claude", frame)}
          {town("codex", frame)}
          {frame.kind === "black" && <div className="absolute inset-0 bg-black" />}
          {cut.endCard(clock)}
        </>
      )}
    </Studio>
  );
}
