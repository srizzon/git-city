import { describe, expect, it } from "vitest";
import { starterObjects, starterOps, approachRoads } from "../starter";
import { TEMPLATE_IDS } from "../templates";
import { LOT } from "../grid";
import { lotKey } from "../placement";
import { emptySnapshot } from "./net";
import { M_TO_UNIT } from "./tuning";
import { activeBots, botSeed, botTarget, isApproachLot, planSlot, roadGraph, sampleBot, slotAt, SLOT_S } from "./bots";

const town = (id: (typeof TEMPLATE_IDS)[number]) => starterObjects(starterOps([{ developer_id: 1, weight: 1 }], id));

describe("town bots", () => {
  it("plans the same drive for the same seed", () => {
    const g = roadGraph(town("race"));
    const a = planSlot(g, botSeed("t", 0, 7));
    const b = planSlot(g, botSeed("t", 0, 7));
    expect(a && b && a.end).toBe(b?.end);
    const s1 = sampleBot(a!, 30, emptySnapshot());
    const s2 = sampleBot(b!, 30, emptySnapshot());
    expect(s1).toEqual(s2);
    expect(planSlot(g, botSeed("t", 1, 7))?.end).not.toBe(a?.end);
  });

  for (const id of TEMPLATE_IDS) {
    it(`${id}: drives in through the gate, stays on the road, moves smoothly and fits its slot`, () => {
      const objects = town(id);
      const g = roadGraph(objects);
      const roads = new Set([...g.roads, ...approachRoads(objects).map((o) => lotKey(o.x, o.z))]);
      for (let i = 0; i < 4; i++) {
        const plan = planSlot(g, botSeed(id, i, 3));
        if (!plan) continue;
        expect(plan.end).toBeLessThan(SLOT_S);
        const first = sampleBot(plan, 0, emptySnapshot())!;
        expect(isApproachLot(Math.round((first.x * M_TO_UNIT) / LOT), Math.round((first.z * M_TO_UNIT) / LOT))).toBe(true);
        let prev: { x: number; z: number } | null = null;
        for (let t = 0; t < plan.end; t += 0.1) {
          const s = sampleBot(plan, t, emptySnapshot())!;
          const lx = Math.round((s.x * M_TO_UNIT) / LOT);
          const lz = Math.round((s.z * M_TO_UNIT) / LOT);
          expect(roads.has(lotKey(lx, lz))).toBe(true);
          if (prev) expect(Math.hypot(s.x - prev.x, s.z - prev.z)).toBeLessThan(2); // < 20 m/s
          prev = s;
        }
        expect(sampleBot(plan, plan.end + 1, emptySnapshot())).toBeNull();
      }
    });
  }

  it("turns the front wheels left on a left turn", () => {
    // A street north from the gate, then a left (west) turn.
    const objects = [
      { item_type: "road" as const, x: 0, z: 0, px: null },
      { item_type: "road" as const, x: 0, z: -1, px: null },
      { item_type: "road" as const, x: -1, z: -1, px: null },
    ];
    const g = roadGraph(objects);
    const plan = planSlot(g, "left")!;
    let steer = 0;
    for (let t = 0; t < plan.end; t += 0.05) {
      const s = sampleBot(plan, t, emptySnapshot())!;
      if (Math.round((s.x * M_TO_UNIT) / LOT) === 0 && Math.round((s.z * M_TO_UNIT) / LOT) === -1 && Math.abs(s.steer) > Math.abs(steer)) steer = s.steer;
    }
    // Whichever way it turns there, the wheels lean into it (some turn happens at (0,-1)).
    expect(Math.abs(steer)).toBeGreaterThan(0.05);
  });

  it("gives way to real drivers and staggers slots", () => {
    const g = roadGraph(town("hq"));
    const n = botTarget(g);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(activeBots(g, 0)).toBe(n);
    expect(activeBots(g, n + 3)).toBe(0);
    expect(slotAt(0, 1000).into).not.toBe(slotAt(1, 1000).into);
  });
});
