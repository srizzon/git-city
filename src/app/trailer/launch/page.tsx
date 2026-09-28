import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCityNorms } from "@/lib/leagues/queries";
import { RIVALRY } from "@/lib/towns/rivalry";
import type { TownSide } from "../towns/towns-film";
import { loadSide } from "../towns/load-side";
import LaunchFilm from "./launch-film";

// The Towns launch trailer in the trailer studio. Not linked from anywhere.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Towns launch - Git City",
  robots: { index: false, follow: false },
};

export default async function TownsLaunchPage() {
  const [norms, ...sides] = await Promise.all([getCityNorms(), ...RIVALRY.map(loadSide)]);
  if (sides.some((s) => !s)) notFound();
  return <LaunchFilm sides={sides as [TownSide, TownSide]} cityNorms={norms} />;
}
