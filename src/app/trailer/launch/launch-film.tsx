"use client";

import type { LayoutNorms } from "@/lib/github";
import { BLASTS, CROWN_LAND, FILM, shotFor } from "@/lib/trailer/towns/launch";
import LaunchEndCard from "@/components/trailer/towns/LaunchEndCard";
import LaunchOverlay from "@/components/trailer/towns/LaunchOverlay";
import TownsFilm, { type TownSide, type TownsCut } from "../towns/towns-film";

// The launch trailer (lib/trailer/towns/launch) in the teaser's towns and rig,
// with its DOM layer over them.

const LAUNCH: TownsCut = {
  film: FILM,
  shotFor,
  blasts: BLASTS,
  endCard: (clock) => <LaunchEndCard clock={clock} />,
  // @srizzon's building stands where the Codex car drifts through it.
  heroInRun: "claude",
  rig: (_stage, town) => ({
    hero: town.tallest[0],
    mascot: town.mascot,
    crownLand: CROWN_LAND,
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
