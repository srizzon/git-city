"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { generateCityLayout, type CityBuilding, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import type { LeagueCity } from "@/lib/league-city/service";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), { ssr: false, loading: () => null });

/** Town of the week, live and slowly turning. Purely visual: the buttons sit on top. */
export default function TownHero({
  city,
  cityDevs,
  cityNorms,
}: {
  city: LeagueCity;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
}) {
  const buildings = useMemo(() => {
    const devs = cityDevs as unknown as DeveloperRecord[];
    const layout = generateCityLayout(devs, undefined, cityNorms);
    const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
    const byDevId = new Map<number, CityBuilding>();
    for (const d of devs) {
      const b = byLogin.get(d.github_login.toLowerCase());
      if (b) byDevId.set(d.id, b);
    }
    return leagueBuildings(city.objects, scaleTownHeights(byDevId));
  }, [city, cityDevs, cityNorms]);

  return <LeagueScene embedded size={city.size} objects={city.objects} buildings={buildings} mode="view" />;
}
