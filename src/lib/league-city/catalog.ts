// ─── Item catalog ───────────────────────────────────────────
// Mirror of league_item_types (migration 144): one row per item type. The SQL
// function reads footprint, radius and limits from the table; the editor reads
// them from here. A new type is a row in both.
//
//   footprint  lot: owns a whole lot (roads, plazas)
//              prop: free position with a round footprint
//              air: flies above the city; no ground collision
//   on_road    props that may stand on asphalt (drive toys, the portal)
//   max        per city; `group` shares one limit across types (plane + blimp)

import type { ItemType } from "./types";

export type Footprint = "lot" | "prop" | "air";

export interface ItemTypeRow {
  footprint: Footprint;
  radius: number;
  max: number | null;
  group: string | null;
  systemOnly: boolean;
  onRoad: boolean;
}

const prop = (radius: number, extra: Partial<ItemTypeRow> = {}): ItemTypeRow => ({
  footprint: "prop",
  radius,
  max: null,
  group: null,
  systemOnly: false,
  onRoad: false,
  ...extra,
});
const toy = (radius: number) => prop(radius, { onRoad: true });
const lot: ItemTypeRow = { footprint: "lot", radius: 0, max: null, group: null, systemOnly: false, onRoad: false };
const air: ItemTypeRow = { footprint: "air", radius: 0, max: 3, group: "sky", systemOnly: false, onRoad: false };

export const CATALOG: Record<ItemType, ItemTypeRow> = {
  road: lot,
  plaza: lot,
  lamp: prop(2),
  bench: prop(3.5),
  fountain: prop(10),
  ramp: toy(15),
  ramp_big: toy(22),
  boost_pad: toy(10),
  speed_bump: toy(11),
  cone: toy(2),
  crates: toy(6),
  tire_wall: toy(9),
  tree_default: prop(7),
  tree_oak: prop(7),
  tree_fat: prop(7),
  tree_detailed: prop(7),
  tree_palm_tall: prop(7),
  tree_pine_tall_a: prop(7),
  // Radius 0: it stands on the south edge line; its pillars flank the road.
  portal: prop(0, { max: 1, systemOnly: true, onRoad: true }),
  billboard: prop(6, { max: 4 }),
  flag: prop(2, { max: 12 }),
  plane: air,
  blimp: air,
};

export function itemRow(t: ItemType | null | undefined): ItemTypeRow | undefined {
  return t ? CATALOG[t] : undefined;
}

export function isAir(t: ItemType | null | undefined): boolean {
  return itemRow(t)?.footprint === "air";
}

/** Types that count toward `t`'s limit (itself, or its whole group). */
export function limitTypes(t: ItemType): ItemType[] {
  const row = CATALOG[t];
  if (!row.group) return [t];
  return (Object.keys(CATALOG) as ItemType[]).filter((k) => CATALOG[k].group === row.group);
}

/** How many of `t` (with its group) the city holds, and its limit. Null limit: no cap. */
export function usage(objects: Iterable<{ item_type: ItemType | null }>, t: ItemType): { used: number; max: number | null } {
  const types = new Set(limitTypes(t));
  let used = 0;
  for (const o of objects) if (o.item_type && types.has(o.item_type)) used++;
  return { used, max: CATALOG[t].max };
}
