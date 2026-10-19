import { describe, expect, it } from "vitest";
import { anchorAt, captionLines, spokenCount, takesOf, type Word } from "./narration";

const WORDS: Word[] = [
  ["Onze", 0.4, 0.8],
  ["devs.", 0.8, 1.2],
  ["Toda", 1.5, 1.7],
  ["semana", 1.7, 2.0],
  ["tem", 2.0, 2.2],
  ["eleição:", 2.2, 2.8],
  ["toda", 3.0, 3.2],
  ["semana.", 3.2, 3.6],
];

describe("anchorAt", () => {
  it("takes seconds, word numbers and words, with a shift", () => {
    expect(anchorAt(WORDS, 1.25)).toBe(1.25);
    expect(anchorAt(WORDS, "#2")).toBe(1.5);
    expect(anchorAt(WORDS, "eleição")).toBe(2.2);
    expect(anchorAt(WORDS, "Eleição+0.3")).toBeCloseTo(2.5);
    expect(anchorAt(WORDS, "#5-0.1")).toBeCloseTo(2.1);
  });

  it("finds a repeated word after a given time", () => {
    expect(anchorAt(WORDS, "toda")).toBe(1.5);
    expect(anchorAt(WORDS, "toda", 2.5)).toBe(3.0);
  });

  it("fails on a word that isn't said", () => {
    expect(() => anchorAt(WORDS, "governador")).toThrow(/isn't said/);
    expect(() => anchorAt(WORDS, "#40")).toThrow(/no word/);
  });
});

describe("captionLines", () => {
  const lines = [
    { show: "*11* devs", say: "Onze devs." },
    { show: "toda semana tem *eleição*" },
    { show: "*toda semana*" },
  ];

  it("counts the spoken words", () => {
    expect(spokenCount(lines)).toBe(8);
  });

  it("lands each shown word on its spoken word, lit between stars", () => {
    const out = captionLines(lines, WORDS, 5);
    expect(out[0]).toEqual({
      from: 0.4,
      to: 1.5,
      words: [
        { text: "11", lit: true, at: 0.4 },
        { text: "devs", lit: false, at: 0.8 },
      ],
    });
    expect(out[1].words.map((w) => [w.text, w.lit, w.at])).toEqual([
      ["toda", false, 1.5],
      ["semana", false, 1.7],
      ["tem", false, 2.0],
      ["eleição", true, 2.2],
    ]);
    expect(out[2]).toMatchObject({ from: 3.0, to: 5 });
    expect(out[2].words.every((w) => w.lit)).toBe(true);
  });

  it("spreads shown words over the line when the counts differ", () => {
    const out = captionLines([{ show: "88.202", say: "Onze devs. Toda semana" }, { show: "x", say: "tem eleição: toda semana." }], WORDS, 5);
    expect(out[0].words).toEqual([{ text: "88.202", lit: false, at: 0.4 }]);
  });

  it("ends a line early with holdMax, so a pause shows nothing", () => {
    const out = captionLines(lines, WORDS, 5, 0.1);
    expect(out[0].to).toBeCloseTo(1.3);
  });

  it("fails when the lines and the narration disagree", () => {
    expect(() => captionLines(lines.slice(0, 2), WORDS, 5)).toThrow(/6 words.*8/);
  });
});

describe("takesOf", () => {
  it("runs each cut until the next, the last until the end", () => {
    const takes = takesOf(
      [
        { name: "A", kind: "overview", stage: "map", from: 0 },
        { name: "B", kind: "dive", stage: "map", from: 2.2 },
      ],
      6,
    );
    expect(takes).toEqual([
      ["A", "map", "overview", 2.2, 0],
      ["B", "map", "dive", 3.8, 0],
    ]);
  });
});
