import type { Rot } from "./grid";

export const ITEM_TYPES = [
  "road",
  "lamp",
  "bench",
  "fountain",
  "plaza",
  "tree_default",
  "tree_oak",
  "tree_fat",
  "tree_detailed",
  "tree_palm_tall",
  "tree_pine_tall_a",
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

export interface CityObject {
  id: string;
  kind: "building" | "item";
  item_type: ItemType | null;
  developer_id: number | null;
  x: number;
  z: number;
  rot: Rot;
  is_new: boolean;
}

export type CityOp =
  | { op: "init"; size: number }
  | { op: "place"; kind: "item"; item_type: ItemType; x: number; z: number; rot?: Rot; id?: string }
  | { op: "place"; kind: "building"; developer_id: number; x: number; z: number; rot?: Rot; id?: string }
  | { op: "move"; id: string; x: number; z: number }
  | { op: "rotate"; id: string; rot: Rot }
  | { op: "remove"; id: string }
  | { op: "remove"; developer_id: number }
  | { op: "dismiss_new"; id: string }
  | { op: "auto_place"; developer_id: number };
