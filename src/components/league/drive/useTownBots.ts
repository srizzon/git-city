"use client";

import { useMemo } from "react";
import { BotSource, activeBots, roadGraph } from "@/lib/league-city/drive/bots";
import { carColor } from "@/lib/league-city/drive/net";
import type { CityObject } from "@/lib/league-city/types";
import type { CarFeed } from "./useDrivePresence";

/**
 * The town's bots as car feeds: as many as the town gets, minus the people
 * driving it (`realDrivers`), so bots make way when people show up.
 */
export function useTownBots(town: string, objects: readonly CityObject[], realDrivers: number, enabled = true): CarFeed[] {
  // Only the streets matter: a new bench or building keeps the same bots.
  const roadsKey = useMemo(
    () =>
      objects
        .filter((o) => o.px === null && o.item_type === "road")
        .map((o) => `${o.x},${o.z}`)
        .sort()
        .join("|"),
    [objects],
  );
  const graph = useMemo(
    () =>
      roadGraph(
        roadsKey
          ? roadsKey.split("|").map((k) => {
              const [x, z] = k.split(",").map(Number);
              return { item_type: "road" as const, x, z, px: null };
            })
          : [],
      ),
    [roadsKey],
  );
  const n = enabled ? activeBots(graph, realDrivers) : 0;
  return useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        id: `bot:${i}`,
        name: "bot",
        color: carColor(`${town}:bot:${i}`),
        buffer: new BotSource(graph, town, i),
        bot: true,
      })),
    [graph, town, n],
  );
}
