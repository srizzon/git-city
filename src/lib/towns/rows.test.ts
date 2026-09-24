import { describe, expect, it } from "vitest";
import {
  displayCount,
  mondayOf,
  pickFeatured,
  selectRows,
  surpriseCandidates,
  toCard,
  type TownEntry,
} from "./rows";

const now = new Date("2026-09-25T12:00:00Z"); // a Friday

function town(id: string, over: Partial<TownEntry> = {}): TownEntry {
  return {
    id,
    slug: id,
    name: id.toUpperCase(),
    kind: "custom",
    github_org: null,
    created_at: "2026-01-01T00:00:00Z",
    featured_week: null,
    buildings: 12,
    ops_7d: 0,
    visitors_7d: 0,
    visitors_prev: 0,
    ...over,
  };
}

describe("displayCount", () => {
  it("hides anything under 10", () => {
    expect(displayCount(0)).toBeNull();
    expect(displayCount(9)).toBeNull();
    expect(displayCount(10)).toBe(10);
  });
});

describe("trending", () => {
  it("needs 5 visitors and growth, sorted by growth", () => {
    const rows = selectRows(
      [
        town("small", { visitors_7d: 4, visitors_prev: 0 }),
        town("flat", { visitors_7d: 8, visitors_prev: 8 }),
        town("up3", { visitors_7d: 6, visitors_prev: 3 }),
        town("up10", { visitors_7d: 12, visitors_prev: 2 }),
      ],
      { now, featuredId: null, companies: [] },
    );
    expect(rows.trending.map((c) => c.slug)).toEqual(["up10", "up3"]);
  });
});

describe("new towns", () => {
  it("are 14 days old at most with 3+ buildings", () => {
    const rows = selectRows(
      [
        town("old", { created_at: "2026-09-10T11:00:00Z" }),
        town("edge", { created_at: "2026-09-11T12:00:00Z" }),
        town("empty", { created_at: "2026-09-20T00:00:00Z", buildings: 2 }),
        town("fresh", { created_at: "2026-09-24T00:00:00Z", buildings: 3 }),
      ],
      { now, featuredId: null, companies: [] },
    );
    expect(rows.new.map((c) => c.slug)).toEqual(["fresh", "edge"]);
  });
});

describe("updated and companies", () => {
  it("updated needs 10+ ops; companies keep ranking order, companies only", () => {
    const rows = selectRows(
      [town("busy", { ops_7d: 30 }), town("quiet", { ops_7d: 9 }), town("acme", { kind: "company" }), town("beta", { kind: "company" })],
      { now, featuredId: null, companies: ["beta", "acme", "busy"] },
    );
    expect(rows.updated.map((c) => c.slug)).toEqual(["busy"]);
    expect(rows.companies.map((c) => c.slug)).toEqual(["beta", "acme"]);
  });
});

describe("dedupe", () => {
  it("puts a town in at most 2 rows, featured included", () => {
    const hot = town("hot", { visitors_7d: 20, ops_7d: 50, created_at: "2026-09-24T00:00:00Z", buildings: 99 });
    const rows = selectRows([hot], { now, featuredId: null, companies: [] });
    const seen = Object.values(rows).filter((r) => r.some((c) => c.slug === "hot")).length;
    expect(seen).toBe(2);
    expect(rows.trending).toHaveLength(1);
    expect(rows.new).toHaveLength(1);
    expect(rows.biggest).toHaveLength(0);

    const featured = selectRows([hot], { now, featuredId: "hot", companies: [] });
    expect(Object.values(featured).filter((r) => r.length > 0)).toHaveLength(1);
    expect(featured.trending).toHaveLength(1);
  });

  it("caps rows at 20", () => {
    const many = Array.from({ length: 30 }, (_, i) => town(`t${i}`, { buildings: 100 - i }));
    expect(selectRows(many, { now, featuredId: null, companies: [] }).biggest).toHaveLength(20);
  });
});

describe("cards", () => {
  it("hide small counts and tag trending before new", () => {
    expect(toCard(town("a", { buildings: 4 }), now).buildings).toBeNull();
    expect(toCard(town("a", { visitors_7d: 9, created_at: "2026-09-24T00:00:00Z" }), now).tag).toBe("trending");
    expect(toCard(town("a", { created_at: "2026-09-24T00:00:00Z" }), now).tag).toBe("new");
    expect(toCard(town("a", { kind: "company" }), now).verified).toBe(true);
    expect(toCard(town("acme"), now).name).toBe("ACME Town");
  });
});

describe("featured", () => {
  it("takes this week's pick, else the latest past one, skipping empty towns", () => {
    expect(mondayOf(now)).toBe("2026-09-21");
    const towns = [
      town("old", { featured_week: "2026-09-07" }),
      town("last", { featured_week: "2026-09-14" }),
      town("gone", { featured_week: "2026-09-21", buildings: 0 }),
      town("future", { featured_week: "2026-09-28" }),
    ];
    expect(pickFeatured(towns, now)?.slug).toBe("last");
    expect(pickFeatured([...towns, town("now", { featured_week: "2026-09-21" })], now)?.slug).toBe("now");
    expect(pickFeatured([town("x")], now)).toBeNull();
  });
});

describe("surprise", () => {
  it("needs 5+ buildings", () => {
    expect(surpriseCandidates([town("a", { buildings: 4 }), town("b", { buildings: 5 })]).map((t) => t.slug)).toEqual(["b"]);
  });
});
