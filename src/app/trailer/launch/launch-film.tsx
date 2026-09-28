"use client";

import type { LayoutNorms } from "@/lib/github";
import { BLASTS, FILM, shotFor } from "@/lib/trailer/towns/launch";
import LaunchEndCard from "@/components/trailer/towns/LaunchEndCard";
import TownsFilm, { type TownSide, type TownsCut } from "../towns/towns-film";

// The launch trailer (lib/trailer/towns/launch) in the teaser's towns and rig.

const LAUNCH: TownsCut = {
  film: FILM,
  shotFor,
  blasts: BLASTS,
  endCard: (clock) => <LaunchEndCard clock={clock} />,
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
