import { describe, expect, it } from "vitest";
import { CATALOG, limitTypes, usage } from "./catalog";
import { DEFAULT_PROPS, cleanOpsProps, messageProblem, parseProps } from "./props-schema";
import { ITEM_TYPES } from "./types";

describe("catalog", () => {
  it("has a row for every item type", () => {
    expect(Object.keys(CATALOG).sort()).toEqual([...ITEM_TYPES].sort());
  });
  it("caps identity pieces: 1 portal (system only), 4 billboards, 12 flags, 3 planes and blimps together", () => {
    expect(CATALOG.portal).toMatchObject({ max: 1, systemOnly: true, onRoad: true });
    expect(CATALOG.billboard.max).toBe(4);
    expect(CATALOG.flag.max).toBe(12);
    expect(limitTypes("plane").sort()).toEqual(["blimp", "plane"]);
    expect(usage([{ item_type: "plane" }, { item_type: "blimp" }, { item_type: "road" }], "blimp")).toEqual({ used: 2, max: 3 });
  });
  it("flies planes and blimps, keeps roads and plazas on lots", () => {
    expect(CATALOG.plane.footprint).toBe("air");
    expect(CATALOG.road.footprint).toBe("lot");
    expect(CATALOG.tree_oak.footprint).toBe("prop");
  });
});

describe("props schemas", () => {
  it("accepts the defaults", () => {
    expect(parseProps("plane", DEFAULT_PROPS.plane)).toMatchObject({ ok: true });
    expect(parseProps("blimp", DEFAULT_PROPS.blimp)).toMatchObject({ ok: true });
  });
  it("takes a plaza's floor logo toggle and nothing else", () => {
    expect(parseProps("plaza", { logo_floor: true })).toEqual({ ok: true, props: { logo_floor: true } });
    expect(parseProps("plaza", { color: "red" })).toMatchObject({ ok: false });
  });
  it("gives types without a schema no props", () => {
    expect(parseProps("lamp", undefined)).toEqual({ ok: true, props: null });
    expect(parseProps("lamp", { a: 1 })).toMatchObject({ ok: false });
  });
  it("refuses colors off the palette, altitudes out of range, and missing fields", () => {
    expect(parseProps("blimp", { ...DEFAULT_PROPS.blimp, color: "#123456" })).toMatchObject({ ok: false });
    expect(parseProps("plane", { ...DEFAULT_PROPS.plane, alt: 5000 })).toMatchObject({ ok: false });
    expect(parseProps("plane", undefined)).toMatchObject({ ok: false });
  });
  it("cleans message text and refuses links, profanity and long text", () => {
    const r = parseProps("blimp", { ...DEFAULT_PROPS.blimp, text: "  ship   it  " });
    expect(r.ok && r.props?.text).toBe("ship it");
    expect(messageProblem("visit acme.com")).toMatch(/links/i);
    expect(messageProblem("https://x.y")).toMatch(/links/i);
    expect(messageProblem("fuck this")).toMatch(/different/i);
    expect(messageProblem("x".repeat(81))).toMatch(/80/);
    expect(messageProblem("")).toMatch(/write/i);
  });
  it("checks set_props against the object's type, and places in the same batch", () => {
    const typeOf = (id: string) => (id === "bl" ? ("blimp" as const) : undefined);
    expect(cleanOpsProps([{ op: "set_props", id: "bl", props: { text: "hi" } }], typeOf)).toMatchObject({ ok: false });
    expect(cleanOpsProps([{ op: "set_props", id: "bl", props: DEFAULT_PROPS.blimp! }], typeOf)).toMatchObject({ ok: true });
    const ops = cleanOpsProps(
      [
        { op: "place", kind: "item", item_type: "plane", px: 0, pz: -48, id: "p1", props: DEFAULT_PROPS.plane },
        { op: "set_props", id: "p1", props: { ...DEFAULT_PROPS.plane!, text: "go team" } },
      ],
      typeOf,
    );
    expect(ops.ok).toBe(true);
    expect(cleanOpsProps([{ op: "place", kind: "item", item_type: "plane", px: 0, pz: -48 }], typeOf)).toMatchObject({ ok: false });
    expect(cleanOpsProps([{ op: "set_props", id: "gone", props: {} }], typeOf)).toMatchObject({ ok: false });
  });
});
