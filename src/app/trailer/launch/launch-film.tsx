"use client";

import type { LayoutNorms } from "@/lib/github";
import { BLASTS, FILM, WEEK, shotFor } from "@/lib/trailer/towns/launch";
import LaunchEndCard from "@/components/trailer/towns/LaunchEndCard";
import LaunchOverlay from "@/components/trailer/towns/LaunchOverlay";
import TownsFilm, { type TownSide, type TownsCut } from "../towns/towns-film";

// The launch trailer (lib/trailer/towns/launch) in the teaser's towns and rig,
// with its DOM layer over them.

const WON = WEEK.claude.reduce((a, b) => a + b, 0);

const LAUNCH: TownsCut = {
  film: FILM,
  shotFor,
  blasts: BLASTS,
  endCard: (clock) => <LaunchEndCard clock={clock} />,
  // Low neighbours, so the tower the car brings down stands alone.
  runHeights: [54, 60, 50, 58, 190],
  rig: (stage, town) => ({
    hero: town.tallest[0],
    mascot: town.mascot,
    riseFrom: 0.25,
    monument:
      stage === "claude"
        ? {
            slug: town.side.slug,
            name: town.side.name,
            logoUrl: town.side.city.identity.logoUrl,
            perDev: WON,
            coding: town.faces.length,
          }
        : null,
  }),
  overlay: (clock, towns) => <LaunchOverlay clock={clock} towns={towns} />,
};

export default function LaunchFilm({
  sides,
  cityNorms,
}: {
  sides: [TownSide, TownSide];
  cityNorms: LayoutNorms;
}) {
  return <TownsFilm sides={sides} cityNorms={cityNorms} cut={LAUNCH} />;
}
