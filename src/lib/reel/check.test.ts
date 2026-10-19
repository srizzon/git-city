import { describe, expect, it } from "vitest";
import { checkPicture, checkText, checkTimed } from "./check";
import { ReelSpec } from "./spec";

const base = ReelSpec.parse({
  id: "2026-10-19-main",
  kind: "main",
  world: { type: "brasil" },
  header: { rule: [{ text: "*{facts.total} devs*", size: "big" }], cta: [{ text: "*seuuser SP*", size: "big", plain: true }], ctaAt: "Comenta" },
  lines: [
    { show: "*{facts.gap}* devs", say: "Onze devs." },
    { show: "separam PE de CE", say: "separam Pernambuco do Ceará." },
    { show: "comenta seu user", say: "Comenta seu user." },
  ],
  scenes: [
    { scene: "overview", at: 0 },
    { scene: "dive", at: "separam", params: { uf: "PE" } },
    { scene: "pullback", at: "Comenta" },
  ],
  facts: { total: 1665, gap: 11 },
  post: { caption: "Comenta seu user (ex: seuuser PE).", watch: true },
});
const ctx = { scenes: ["overview", "dive", "orbit", "pullback"], priorHooks: [], verifiedHandles: ["samuelrizzondev"] };
const fails = (issues: { level: string; rule: string }[]) => issues.filter((i) => i.level === "fail").map((i) => i.rule);

describe("checkText", () => {
  it("passes a clean spec", () => {
    expect(fails(checkText(base, ctx))).toEqual([]);
  });

  it("fails teu/tua and gamer words", () => {
    const spec = { ...base, lines: [{ show: "cadê o teu prédio", say: "cadê o teu prédio" }, ...base.lines.slice(1)] };
    expect(fails(checkText(spec, ctx))).toContain("words");
  });

  it("fails a number on screen that isn't a fact, and digits the voice would read", () => {
    const spec = { ...base, lines: [{ show: "*12* devs" }, ...base.lines.slice(1)] };
    const rules = fails(checkText(spec, ctx));
    expect(rules).toContain("real data");
    expect(rules).toContain("voice");
  });

  it("fails a reused hook, a scene twice in a row and a scene the world doesn't have", () => {
    const spec = { ...base, scenes: [base.scenes[0], base.scenes[0], { scene: "fly", at: "Comenta", params: {} }] };
    const rules = fails(checkText(spec, { ...ctx, priorHooks: ["11 devs"] }));
    expect(rules).toEqual(expect.arrayContaining(["hook", "scenes"]));
  });

  it("fails a trial that copies the main's hook, opening or bed", () => {
    const trial = { ...base, id: "2026-10-19-t1", kind: "trial" as const };
    expect(fails(checkText(trial, { ...ctx, main: base }))).toEqual(["trial", "trial", "trial"]);
  });

  it("fails an unverified @ in the caption and a watched reel without the parseable CTA", () => {
    const spec = { ...base, header: { ...base.header, cta: [{ text: "comenta", size: "big" as const }] }, post: { caption: "oi @fulano", watch: true } };
    expect(fails(checkText(spec, ctx))).toEqual(expect.arrayContaining(["cta", "caption"]));
  });
});

describe("checkTimed", () => {
  it("fails narration outside 15–22s", () => {
    const words = ["Onze", "devs.", "separam", "Pernambuco", "do", "Ceará.", "Comenta", "seu", "user."].map((w, i): [string, number, number] => [w, 0.4 + i, 0.9 + i]);
    expect(fails(checkTimed(base, words))).toEqual(["length"]);
  });
});

describe("checkPicture", () => {
  it("fails boxes outside the safe zone and captions over the roof", () => {
    const issues = checkPicture([
      {
        t: 1,
        boxes: [
          { name: "header", x: 0.3, y: 0.1, w: 0.4, h: 0.08 },
          { name: "captions", x: 0.2, y: 0.55, w: 0.6, h: 0.05 },
          { name: "roof", x: 0.5, y: 0.57, w: 0, h: 0 },
        ],
      },
    ]);
    expect(issues.map((i) => i.rule)).toEqual(["safe zone", "subject"]);
  });
});
