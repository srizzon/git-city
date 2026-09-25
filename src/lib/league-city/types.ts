export const ITEM_TYPES = [
  "road",
  "lamp",
  "bench",
  "fountain",
  "plaza",
  "ramp",
  "ramp_big",
  "boost_pad",
  "speed_bump",
  "cone",
  "crates",
  "tire_wall",
  "tree_default",
  "tree_oak",
  "tree_fat",
  "tree_detailed",
  "tree_palm_tall",
  "tree_pine_tall_a",
  "portal",
  "billboard",
  "flag",
  "plane",
  "blimp",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TREE_TYPES = [
  "tree_default",
  "tree_oak",
  "tree_fat",
  "tree_detailed",
  "tree_palm_tall",
  "tree_pine_tall_a",
] as const satisfies readonly ItemType[];
export type TreeType = (typeof TREE_TYPES)[number];

/** Props for drive mode. Unlike other props they may stand on asphalt. */
export const DRIVE_TOYS = ["ramp", "ramp_big", "boost_pad", "speed_bump", "cone", "crates", "tire_wall"] as const satisfies readonly ItemType[];

export function isDriveToy(t: ItemType | null | undefined): boolean {
  return !!t && (DRIVE_TOYS as readonly string[]).includes(t);
}

/** Items that own a whole lot. Everything else is a free-standing prop. */
export const SURFACE_TYPES = ["road", "plaza"] as const satisfies readonly ItemType[];
export type SurfaceType = (typeof SURFACE_TYPES)[number];
export type PropType = Exclude<ItemType, SurfaceType>;

export function isSurface(t: ItemType | null | undefined): t is SurfaceType {
  return t === "road" || t === "plaza";
}

/** Identity pieces: placed from the editor's Identity tab (the portal only by the system). */
export const IDENTITY_TYPES = ["portal", "billboard", "flag", "plane", "blimp"] as const satisfies readonly ItemType[];
export type IdentityType = (typeof IDENTITY_TYPES)[number];

/** Pieces that show the league logo. */
export const LOGO_TYPES = ["billboard", "flag"] as const satisfies readonly ItemType[];

/** Per-type settings (text, colors, logo_floor…). See props-schema.ts. */
export type ObjectProps = Record<string, unknown>;

export interface CityObject {
  id: string;
  kind: "building" | "item";
  item_type: ItemType | null;
  developer_id: number | null;
  /** Lot. For props: the lot under the prop's center. */
  x: number;
  z: number;
  /** Props only: world position. Null for buildings, roads and plazas. */
  px: number | null;
  pz: number | null;
  /** Degrees clockwise. Lot objects: quarter turns. Props: 0–359. */
  rot: number;
  is_new: boolean;
  /** Per-type settings, validated by props-schema.ts. Null when the type has none. */
  props?: ObjectProps | null;
  /** Only the system may change it (the portal, the entrance road). */
  locked?: boolean;
}

export type CityOp =
  | { op: "init"; h: number }
  | { op: "place"; kind: "item"; item_type: SurfaceType; x: number; z: number; rot?: number; id?: string; props?: ObjectProps; locked?: boolean }
  | { op: "place"; kind: "item"; item_type: PropType; px: number; pz: number; rot?: number; id?: string; props?: ObjectProps; locked?: boolean }
  | { op: "place"; kind: "item"; item_type: PropType; x: number; z: number; rot?: number; id?: string; props?: ObjectProps; locked?: boolean }
  | { op: "place"; kind: "building"; developer_id: number; x: number; z: number; rot?: number; id?: string }
  | { op: "move"; id: string; x: number; z: number }
  | { op: "move"; id: string; px: number; pz: number }
  | { op: "rotate"; id: string; rot: number }
  | { op: "set_props"; id: string; props: ObjectProps }
  | { op: "remove"; id: string }
  | { op: "remove"; developer_id: number }
  | { op: "dismiss_new"; id: string }
  | { op: "auto_place"; developer_id: number }
  | { op: "expand" }
  | { op: "shrink" };

export type SignSide = "north" | "east" | "west";

/** The league's look: sky, hill sign, logo. Bumps identity_version on change. */
export interface CityIdentity {
  /** Index into THEMES (components/city/theme). */
  sky: number;
  /** Hill sign side; null = no hill sign. */
  signSide: SignSide | null;
  logoUrl: string | null;
  /** A takedown removed the logo: pieces show name plates, the admin uploads another. */
  logoRemoved: boolean;
  identityVersion: number;
}
