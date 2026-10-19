import { describe, expect, it } from "vitest";
import { brasilDay, brasiliaToday, dayLine } from "./brasil-day";
import type { Resident } from "./brasil-map";

const at = (iso: string) => Date.parse(iso);
const CAPITAL: Record<string, number> = { SP: 3550308, BA: 2927408 };
const r = (login: string, uf: Resident["dev"]["uf"], when: string): Resident => ({ dev: { id: login.length, login, uf }, city: uf ? CAPITAL[uf] : null, lx: 0, lz: 0, at: at(when) });

const residents = [
  r("ana", "SP", "2026-10-19T13:00:00Z"),
  r("bia", "SP", "2026-10-19T20:00:00Z"),
  r("caio", null, "2026-10-20T02:59:00Z"), // still Oct 19 in Brasília
  r("duda", "BA", "2026-10-20T15:00:00Z"),
  r("enzo", "SP", "2026-10-20T16:00:00Z"),
];

describe("brasilDay", () => {
  it("counts a day on Brasília time", () => {
    const d = brasilDay(residents, "2026-10-19", "2026-10-19");
    expect(d.day).toBe(1);
    expect(d.devs).toBe(3);
    expect(d.arrived.map((a) => a.login)).toEqual(["ana", "bia", "caio"]);
    expect(d.newFounders).toEqual([{ login: "ana", uf: "SP", city: "São Paulo" }]);
  });
  it("adds up to the day and names that day's founders", () => {
    const d = brasilDay(residents, "2026-10-20", "2026-10-19");
    expect(d.day).toBe(2);
    expect(d.devs).toBe(5);
    expect(d.founded).toBe(2);
    expect(d.newFounders).toEqual([{ login: "duda", uf: "BA", city: "Salvador" }]);
    expect(d.states[0]).toEqual({ uf: "SP", devs: 3, today: 1 });
    expect(dayLine(d)).toBe("Day 2 · 5 devs · 2 cities · +2 today. New cities: Salvador (BA) by @duda.");
  });
  it("knows today's date in Brasília", () => {
    expect(brasiliaToday(at("2026-10-20T02:00:00Z"))).toBe("2026-10-19");
  });
});
