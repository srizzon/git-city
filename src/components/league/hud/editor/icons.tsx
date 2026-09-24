import type { ItemType } from "@/lib/league-city/types";

// 12×12 pixel icons for the hotbar, drawn from character grids so they stay
// crisp at any integer scale. "." is transparent.

type Sprite = { rows: string[]; palette: Record<string, string> };

const TRUNK = "#6b4226";
const SPRITES: Record<ItemType, Sprite> = {
  road: {
    rows: [
      "....aaaa....",
      "....aaaa....",
      "....ayya....",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      "ayyaaaaaayya",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      "....ayya....",
      "....aaaa....",
      "....aaaa....",
      "....aaaa....",
    ],
    palette: { a: "#3a4150", y: "#c8e64a" },
  },
  lamp: {
    rows: [
      "....yyyy....",
      "...yLLLLy...",
      "....yyyy....",
      ".....pp.....",
      ".....pp.....",
      ".....pp.....",
      ".....pp.....",
      ".....pp.....",
      ".....pp.....",
      ".....pp.....",
      "....pppp....",
      "...pppppp...",
    ],
    palette: { y: "#f0d870", L: "#fff4b0", p: "#7a7a86" },
  },
  bench: {
    rows: [
      "............",
      "............",
      "............",
      "wwwwwwwwwwww",
      "wwwwwwwwwwww",
      "............",
      "wwwwwwwwwwww",
      "WWWWWWWWWWWW",
      ".mm......mm.",
      ".mm......mm.",
      ".mm......mm.",
      "............",
    ],
    palette: { w: "#9a6a40", W: "#6b4226", m: "#4a4a52" },
  },
  fountain: {
    rows: [
      ".....bb.....",
      "....b..b....",
      "...b.bb.b...",
      ".....bb.....",
      "....gggg....",
      "....gbbg....",
      "..gggggggg..",
      ".gbbbbbbbbg.",
      ".gbbbbbbbbg.",
      ".gggggggggg.",
      "............",
      "............",
    ],
    palette: { b: "#5fb0f0", g: "#9a9aa6" },
  },
  ramp: {
    rows: [
      "............",
      "............",
      "............",
      "..........oo",
      "........oorr",
      "......oorrrr",
      "....oorrrrrr",
      "..oorrrrrrrr",
      "oorrrrrrrrrr",
      "RRRRRRRRRRRR",
      "............",
      "............",
    ],
    palette: { o: "#f0a030", r: "#c8703a", R: "#7a4a2a" },
  },
  plaza: {
    rows: [
      "............",
      "............",
      "ssssssssssss",
      "sSssSssSssSs",
      "ssssssssssss",
      "ssSssSssSsss",
      "ssssssssssss",
      "sSssSssSssSs",
      "ssssssssssss",
      "SSSSSSSSSSSS",
      "............",
      "............",
    ],
    palette: { s: "#8a90a0", S: "#686e7c" },
  },
  tree_default: {
    rows: [
      ".....gg.....",
      "....gggg....",
      "...gggggg...",
      "....gggg....",
      "...gggggg...",
      "..gggGgggg..",
      "...gggggg...",
      "..gggggggg..",
      ".gggGggggGg.",
      ".....tt.....",
      ".....tt.....",
      "....tttt....",
    ],
    palette: { g: "#3fa04a", G: "#2d7a36", t: TRUNK },
  },
  tree_oak: {
    rows: [
      "...gggggg...",
      "..gggGgggg..",
      ".gggggggggg.",
      ".ggGgggggGg.",
      "gggggggggggg",
      ".gggggGgggg.",
      "..gggggggg..",
      "....gggg....",
      ".....tt.....",
      ".....tt.....",
      ".....tt.....",
      "....tttt....",
    ],
    palette: { g: "#4cae3c", G: "#357e2a", t: TRUNK },
  },
  tree_fat: {
    rows: [
      "............",
      "....gggg....",
      "..gggggggg..",
      ".gggGgggggg.",
      "gggggggggggg",
      "gggggggGgggg",
      "gggGgggggggg",
      ".gggggggggg.",
      "..gggggggg..",
      ".....tt.....",
      ".....tt.....",
      "....tttt....",
    ],
    palette: { g: "#5cb845", G: "#3d8a2e", t: TRUNK },
  },
  tree_detailed: {
    rows: [
      "....gg......",
      "...gggg.gg..",
      "..gggggggggg",
      "...ggGggggg.",
      ".gggggg.gg..",
      "gggGggggg...",
      ".ggggg.gggg.",
      "...gg.ggGgg.",
      ".....tt.....",
      "....ttt.....",
      ".....tt.....",
      "....tttt....",
    ],
    palette: { g: "#44a852", G: "#2e7a3a", t: TRUNK },
  },
  tree_palm_tall: {
    rows: [
      "..gg....gg..",
      ".g..gggg..g.",
      "....g.gg....",
      "...g..t.g...",
      "......t.....",
      ".....t......",
      ".....t......",
      ".....t......",
      "......t.....",
      "......t.....",
      "......t.....",
      ".....ttt....",
    ],
    palette: { g: "#5cc05a", t: "#a07a4a" },
  },
  tree_pine_tall_a: {
    rows: [
      ".....gg.....",
      ".....gg.....",
      "....gggg....",
      "....gGgg....",
      "...gggggg...",
      "...ggggGg...",
      "..gggggggg..",
      "..gGgggggg..",
      ".gggggggggg.",
      ".....tt.....",
      ".....tt.....",
      "....tttt....",
    ],
    palette: { g: "#2f8a4a", G: "#1f6636", t: TRUNK },
  },
};

export function ItemIcon({ item, size = 24 }: { item: ItemType; size?: number }) {
  const { rows, palette } = SPRITES[item];
  const rects: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]];
      if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c} />);
    }
  });
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  );
}

export const ITEM_NAMES: Record<ItemType, string> = {
  road: "Road",
  lamp: "Lamp",
  bench: "Bench",
  fountain: "Fountain",
  plaza: "Plaza",
  ramp: "Ramp",
  tree_default: "Tree",
  tree_oak: "Oak",
  tree_fat: "Bush tree",
  tree_detailed: "Wild tree",
  tree_palm_tall: "Palm",
  tree_pine_tall_a: "Pine",
};
