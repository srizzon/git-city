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
import { TOWN_MAX_HEIGHT, leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { smashStoreFor } from "@/lib/league-city/smash";
import { Transport } from "@trailer-kit/clock";
import type { Film, Frame } from "@trailer-kit/film";
import { BLASTS, FILM, shotFor, smashRun, type Stage } from "@/lib/trailer/towns/teaser";
import Studio from "@trailer-kit/Studio";
import TownsRig from "@/components/trailer/towns/TownsRig";
import EndCard from "@/components/trailer/towns/EndCard";
import type { MonumentTown } from "@/components/towns/TownMonument";

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
  /** Other real Git City devs to fill the empty lots with, in a film that wants a full town. */
  fill?: Record<string, unknown>[];
}

function useTown(side: TownSide, cityNorms: LayoutNorms, gen: number, runHeights?: number[], heroInRun = false) {
  const base = useMemo(() => {
    const members = side.cityDevs as unknown as DeveloperRecord[];
    const fill = (side.fill ?? []) as unknown as DeveloperRecord[];
    const devs = [...members, ...fill];
    const layout = generateCityLayout(devs, undefined, cityNorms);
    const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
    const byDevId = new Map<number, CityBuilding>();
    for (const d of devs) {
      const b = byLogin.get(d.github_login.toLowerCase());
      if (b) byDevId.set(d.id, b);
    }
    const scaled = scaleTownHeights(byDevId);
    const first = leagueBuildings(side.city.objects, scaled);
    const run = first.length ? smashRun(side.city.objects, side.city.h, first[0], runHeights) : null;
    // The fill goes on the free lots nearest the main street, leaving the run's.
    const objects = [...side.city.objects, ...fillLots(side.city.objects, side.city.h, run, fill)];
    // No real crowns: the film drops its own. With a fill, the town's top
    // member stands tallest, so the crown shot has the sky behind it.
    const top = members.length ? [...members].sort((a, b) => (byDevId.get(b.id)?.height ?? 0) - (byDevId.get(a.id)?.height ?? 0))[0] : null;
    const real = leagueBuildings(objects, scaled).map((b) => {
      const out = { ...b, active_league_crown: null };
      if (fill.length && top && b.loginLower === top.github_login.toLowerCase())
        return { ...out, height: TOWN_MAX_HEIGHT, floors: Math.floor(TOWN_MAX_HEIGHT / 6) };
      return out;
    });
    let town = real;
    if (heroInRun && run && top) {
      // The hero's building moves onto the lot the corner drift goes through.
      const login = top.github_login.toLowerCase();
      const hero = real.find((b) => b.loginLower === login);
      const slot = run.buildings[2];
      if (hero) {
        run.buildings[2] = { ...hero, position: slot.position };
        town = real.filter((b) => b !== hero);
      }
    }
    const buildings = run ? [...town, ...run.buildings] : town;
    const memberLogins = new Set(members.map((d) => d.github_login.toLowerCase()));
    const portal = side.city.objects.find((o) => o.item_type === "portal");
    const giant = side.city.objects.find(
      (o) => (o.item_type === "clawd" || o.item_type === "codex_cloud") && (o.props as { size?: string } | null)?.size === "giant",
    );
    const facts: TownFacts = {
      side,
      tallest: real
        .filter((b) => memberLogins.has(b.loginLower))
        .sort((a, b) => b.height - a.height)
        .map((b) => b.loginLower),
      faces: devs.filter((d) => d.avatar_url).map((d) => ({ login: d.github_login, avatar_url: d.avatar_url })),
      mascot: giant ? [giant.px ?? giant.x * LOT, giant.pz ?? giant.z * LOT] : undefined,
    };
    return { buildings, run, gateZ: portal?.pz ?? 24, revZ: plainStreet(side.city.objects), facts };
  }, [side, cityNorms, runHeights, heroInRun]);
  // A fresh store puts every building back up (a new take, a loop, a seek back).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => smashStoreFor(base.buildings), [base, gen]);
  return { ...base, store };
}

/** Building objects for the fill devs on the free lots nearest the main street (not the run's). */
function fillLots(
  objects: readonly CityObject[],
  h: number,
  run: ReturnType<typeof smashRun>,
  fill: readonly DeveloperRecord[],
): CityObject[] {
  if (!fill.length) return [];
  const taken = new Set(objects.map((o) => `${o.x},${o.z}`));
  if (run) {
    const col = Math.round(run.x / LOT);
    for (const z of run.zs) taken.add(`${col},${Math.round(z / LOT)}`);
    // The launch's car turns into the row from the main street before its first building.
    for (let z = Math.round(run.zs[0] / LOT) + 1; z <= 0; z++) taken.add(`${col},${z}`);
    // The tower stands alone against the sky, and the tower shots look at it
    // from across the main street: keep its surroundings and that view clear.
    const tz = Math.round(run.zs[run.zs.length - 1] / LOT);
    const dir = col > 0 ? -1 : 1;
    for (let x = col - 2; x <= col + 2; x++) for (let z = tz - 3; z <= tz + 2; z++) taken.add(`${x},${z}`);
    for (let x = col + dir; Math.abs(x - col) <= 4; x += dir)
      for (let z = tz - 1; z <= tz + 2; z++) taken.add(`${x},${z}`);
  }
  const free: [number, number][] = [];
  for (let x = -h; x <= h; x++) for (let z = -2 * h + 1; z <= 0; z++) if (!taken.has(`${x},${z}`)) free.push([x, z]);
  free.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1] + h) * 0.6 - (Math.abs(b[0]) + Math.abs(b[1] + h) * 0.6));
  return fill.slice(0, free.length).map((d, i) => ({
    id: `fill-${d.id}`,
    kind: "building" as const,
    item_type: null,
    developer_id: d.id,
    x: free[i][0],
    z: free[i][1],
    px: null,
    pz: null,
    rot: 0,
    is_new: false,
  }));
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

/** What a cut hands each town's rig beyond the teaser's (see TownsRig). */
export interface RigExtras {
  hero?: string;
  mascot?: [number, number];
  monument?: MonumentTown | null;
  riseFrom?: number;
  ramHit?: number;
  crownLand?: number;
}

/** What a cut can read about each town: its side, the logins by height, the giant mascot. */
export interface TownFacts {
  side: TownSide;
  /** Real members' buildings, tallest first. */
  tallest: string[];
  /** Members' logins and avatars. */
  faces: { login: string; avatar_url: string | null }[];
  mascot?: [number, number];
}

/** Another film in the same towns (the launch trailer): its data, its shots, and its end card. */
export interface TownsCut {
  film: Film<Stage>;
  shotFor: typeof shotFor;
  blasts: readonly number[];
  endCard: (clock: Transport) => ReactNode;
  /** The studio's title. */
  title?: string;
  /** Extra props for a town's rig. */
  rig?: (stage: Stage, town: TownFacts) => RigExtras;
  /** The heights of the run of extra buildings the car smashes (the teaser's by default), tallest last. */
  runHeights?: number[];
  /** Put this town's top member's building where the corner drift hits (the run's third lot). */
  heroInRun?: Stage;
  /** A DOM layer over the pictures (under the titles), on the same clock. */
  overlay?: (clock: Transport, towns: [TownFacts, TownFacts]) => ReactNode;
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
  const claude = useTown(claudeSide, cityNorms, gen, cut.runHeights, cut.heroInRun === "claude");
  const codex = useTown(codexSide, cityNorms, gen, cut.runHeights, cut.heroInRun === "codex");
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
              {...cut.rig?.(stage, t.facts)}
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
          {cut.overlay?.(clock, [claude.facts, codex.facts])}
          {cut.endCard(clock)}
        </>
      )}
    </Studio>
  );
}
