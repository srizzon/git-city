import type { Metadata } from "next";
import { getPitchStats } from "@/lib/pitch-stats";
import PitchDeck from "./PitchDeck";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pitch Deck - Git City",
  description:
    "Git City: transforming GitHub profiles into an interactive 3D city. 11,800+ developers, organic growth, revenue from day one.",
};

export default async function PitchPage() {
  const stats = await getPitchStats();
  return <PitchDeck stats={stats} />;
}
