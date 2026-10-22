import { describe, expect, it } from "vitest";
import { HeistRoom } from "../../../party/heist";
import type { Room } from "../../../party/room";
import { HEIST, RULES } from "./heist";
import { UNIT_TO_M } from "../league-city/drive/tuning";

// The room side of the city of the day, with a fake room: who holds what, when a push lands, who a bust pays.

function setup() {
  const sent = new Map<string, Record<string, unknown>[]>();
  const pos = new Map<string, { x: number; z: number }>();
  const people: Record<string, { login: string; devId: number }> = { r: { login: "robber", devId: 1 }, c: { login: "cop", devId: 2 }, c2: { login: "cop2", devId: 3 } };
  const room = {
    id: "brasil-town",
    broadcast: () => {},
    getConnection: (id: string) => ({ send: (m: string) => sent.set(id, [...(sent.get(id) ?? []), JSON.parse(m)]) }),
  } as unknown as Room;
  const h = new HeistRoom(room, (id) => pos.get(id) ?? null, (id) => people[id] ?? null);
  h.setDay({ day: "2026-10-22", key: "3509502", ring: { x: 0, z: 0, r: 100 } });
  const last = (id: string) => sent.get(id)?.at(-1) ?? null;
  return { h, pos, last };
}

/** A building's middle in city units, so many meters from the ring's middle. */
const at = (m: number) => m / UNIT_TO_M;

describe("HeistRoom", () => {
  it("holds a robber's falls in the ring, not outside it or anyone else's", () => {
    const { h } = setup();
    h.setSide("r", "robber");
    expect(h.fell("r", "robber", at(50), 0)).toBe(true);
    expect(h.fell("r", "robber", at(150), 0)).toBe(false);
    expect(h.fell("x", "nobody", at(10), 0)).toBe(true);
  });

  it("banks a push only after the time out of the ring, with no real cop near", () => {
    const { h, pos, last } = setup();
    h.setSide("r", "robber");
    h.setSide("c", "cop");
    h.fell("r", "robber", 0, 0);
    h.fell("r", "robber", 0, 0);
    pos.set("r", { x: 150, z: 0 });
    pos.set("c", { x: 500, z: 0 });
    h.state("r", 50, 0, 0);
    h.state("r", 150, 0, 1000);
    h.push("r", 2000);
    expect(last("r")?.t).toBe("heist_push_no");
    pos.set("c", { x: 160, z: 0 });
    h.push("r", 1000 + HEIST.pushSecs * 1000);
    expect(last("r")?.t).toBe("heist_push_no");
    pos.set("c", { x: 500, z: 0 });
    h.push("r", 1000 + HEIST.pushSecs * 1000);
    expect(last("r")).toEqual({ t: "heist_pushed", n: 2, pts: 2 * HEIST.building });
    expect(h.take().heist).toEqual([{ attackerId: 1, buildings: 2, at: 1000 + HEIST.pushSecs * 1000 }]);
  });

  it("a bust drops what the robber held and pays the close cop it names", () => {
    const { h, pos, last } = setup();
    h.setSide("r", "robber");
    h.setSide("c", "cop");
    h.setSide("c2", "cop");
    h.fell("r", "robber", 0, 0);
    pos.set("r", { x: 0, z: 0 });
    pos.set("c", { x: 10, z: 0 });
    pos.set("c2", { x: 900, z: 0 });
    h.bust("r", "c2", 5);
    expect(last("r")).toEqual({ t: "heist_busted", lost: 1 });
    expect(h.take().busts).toEqual([]);
    h.fell("r", "robber", 0, 0);
    h.bust("r", "c", 6);
    expect(last("c")?.t).toBe("heist_bust_credit");
    expect(h.take().busts).toEqual([{ copId: 2, robberId: 1, at: 6 }]);
    // Caught empty-handed: nothing to pay.
    h.bust("r", "c", 7);
    expect(h.take().busts).toEqual([]);
  });

  it("credits the building whose shot ended a run, only when the robber held something", () => {
    const { h } = setup();
    h.setSide("r", "robber");
    h.bust("r", undefined, 1, "dev-a");
    expect(h.take().turrets).toEqual([]);
    h.fell("r", "robber", 0, 0);
    h.bust("r", undefined, 2, "dev-a");
    expect(h.take().turrets).toEqual([{ login: "dev-a", at: 2 }]);
  });

  it("pays a game-run bust only with no real robber in the room, spaced out", () => {
    const { h, pos } = setup();
    h.setSide("c", "cop");
    pos.set("c", { x: 0, z: 0 });
    h.gangBust("c", 1000);
    h.gangBust("c", 2000);
    expect(h.take().busts).toHaveLength(1);
    h.gangBust("c", 1000 + RULES.gangBustGapMs);
    h.setSide("r", "robber");
    h.gangBust("c", 9e9);
    expect(h.take().busts).toHaveLength(1);
  });

  it("a kit weapon is the side's own, charged, near the city", () => {
    const { h, pos } = setup();
    h.setSide("r", "robber");
    pos.set("r", { x: 0, z: 0 });
    expect(h.kit("r", "magnet", 0)).toBe(false);
    expect(h.kit("r", "duck", 100_000)).toBe(true);
    expect(h.kit("r", "duck", 101_000)).toBe(false);
    expect(h.kit("r", "duck", 100_000 + RULES.kitMs.duck)).toBe(true);
    pos.set("r", { x: 10_000, z: 0 });
    expect(h.kit("r", "bomb", 900_000)).toBe(false);
  });

  it("a new day forgets yesterday's sides and holdings", () => {
    const { h, pos, last } = setup();
    h.setSide("r", "robber");
    h.fell("r", "robber", 0, 0);
    h.setDay({ day: "2026-10-23", key: "1", ring: { x: 0, z: 0, r: 100 } });
    expect(h.side("r")).toBeNull();
    h.setSide("r", "robber");
    pos.set("r", { x: 150, z: 0 });
    h.state("r", 150, 0, 0);
    h.push("r", 60_000);
    expect(last("r")?.t).toBe("heist_push_no");
  });
});
