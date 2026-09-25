// Commands from the map UI (compass, zoom buttons, city chips, radar clicks)
// to the explore camera in CityCanvas, without threading props through it.
export type MapNavCommand =
  | { type: "flyTo"; x: number; z: number; distance?: number }
  | { type: "north" }
  | { type: "zoom"; factor: number };

const subs = new Set<(c: MapNavCommand) => void>();

export const mapNav = {
  send: (c: MapNavCommand) => subs.forEach((f) => f(c)),
  subscribe: (f: (c: MapNavCommand) => void) => {
    subs.add(f);
    return () => { subs.delete(f); };
  },
};

// Downtown of each city on the Bay Area map, in world units (same projection
// as the map bake: origin at FiDi, x east, z south).
export const MAP_PLACES: { label: string; x: number; z: number }[] = [
  { label: "SF", x: 0, z: 0 },
  { label: "Oakland", x: 11394, z: -1091 },
  { label: "Berkeley", x: 11262, z: -8572 },
  { label: "Marin", x: -7443, z: -7180 },
  { label: "Daly City", x: -6115, z: 11878 },
];
