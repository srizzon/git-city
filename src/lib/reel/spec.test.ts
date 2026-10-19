import { describe, expect, it } from "vitest";
import { parseSpec, ReelSpec } from "./spec";

const main = {
  id: "2026-10-20-main",
  kind: "main",
  world: { type: "brasil" },
  header: { rule: [{ text: "1 dev = 1 prédio", size: "big" }], cta: [{ text: "seuuser SP", size: "big", plain: true }], ctaAt: "#5" },
  lines: [{ show: "onze devs" }, { show: "separam PE" }, { show: "comenta seu user" }],
  scenes: [
    { scene: "overview", at: 0 },
    { scene: "dive", at: "#2", params: { uf: "PE" } },
    { scene: "pullback", at: "#4+0.2" },
  ],
  bed: "lofi-up-1.mp3",
  post: { caption: "Comenta.", watch: true, cover: { prompt: "a cover" } },
};
const trial = (variation: unknown) => parseSpec({ id: "2026-10-20-t1", kind: "trial", variation }, () => main);

describe("parseSpec", () => {
  it("reads a full spec as it is", () => {
    expect(parseSpec(main, () => null)).toEqual(ReelSpec.parse(main));
  });

  it("a voice variation swaps the first lines and moves word anchors after them", () => {
    const t = trial({ test: "voice", lines: [{ show: "só onze devs hoje" }] });
    expect(t.lines.map((l) => l.show)).toEqual(["só onze devs hoje", "separam PE", "comenta seu user"]);
    // Two words became four: anchors from word 2 on move by two.
    expect(t.scenes.map((s) => s.at)).toEqual([0, "#4", "#6+0.2"]);
    expect(t.header?.ctaAt).toBe("#7");
  });

  it("a text variation changes only the rule up top", () => {
    const t = trial({ test: "text", lines: [{ text: "seu prédio no mapa", size: "big" }] });
    expect(t.header?.rule[0].text).toBe("seu prédio no mapa");
    expect(t.header?.cta).toEqual(ReelSpec.parse(main).header?.cta);
    expect(t.lines).toEqual(ReelSpec.parse(main).lines);
  });

  it("a shot variation changes the opening scene and keeps its start", () => {
    const t = trial({ test: "shot", scene: { scene: "orbit", params: { login: "srizzon" } } });
    expect(t.scenes[0]).toMatchObject({ scene: "orbit", at: 0 });
    expect(t.scenes.slice(1)).toEqual(ReelSpec.parse(main).scenes.slice(1));
  });

  it("a trial has no cover, its own bed from the rotation, and remembers its variation", () => {
    const t = trial({ test: "shot", scene: { scene: "orbit" } });
    expect(t.kind).toBe("trial");
    expect(t.post.cover).toBeUndefined();
    expect(t.bed).toBeUndefined();
    expect(t.variation?.test).toBe("shot");
  });
});
