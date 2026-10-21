import { describe, expect, it } from "vitest";
import { brasilOffices, officeLabel } from "./brasil-roles";
import type { BrasilLayout, CityLayout } from "./brasil-map";

const dev = (login: string, uf: CityLayout["uf"]) => ({ dev: { id: login.length, login, uf }, x: 0, z: 0, founder: false, at: 0 });
const city = (name: string, uf: CityLayout["uf"], logins: string[], key: string) => ({ name, uf, key, capital: false, devs: logins.map((l) => dev(l, uf)) }) as unknown as CityLayout;

const layout = {
  cities: [city("São Paulo", "SP", ["ana", "bia", "caio", "duda"], "3550308"), city("Campinas", "SP", ["enzo"], "3509502"), city("Salvador", "BA", ["fabi"], "2927408")],
  island: { devs: [dev("gus", null)] } as unknown as CityLayout,
  highways: [],
} as unknown as BrasilLayout;

describe("brasilOffices", () => {
  const totals = new Map([["ana", 50], ["bia", 90], ["caio", 10], ["duda", 0], ["enzo", 70], ["fabi", 200], ["gus", 300]]);
  const o = brasilOffices(layout, totals, "Gus");
  it("the president comes from the vote and holds nothing else", () => {
    expect(o.president).toBe("gus");
    expect(o.byLogin.get("gus")?.map((o) => officeLabel(o))).toEqual(["President"]);
    expect(brasilOffices(layout, totals).president).toBeNull();
  });
  it("one office each, from the top down: governor, then the next one to the Senate", () => {
    expect(o.governors.get("SP")).toBe("bia");
    expect(o.senators.get("SP")).toEqual(["enzo"]);
    expect(o.governors.get("BA")).toBe("fabi");
    expect(o.senators.has("BA")).toBe(false);
  });
  it("a mayor is whoever is left; nobody who didn't code holds anything", () => {
    expect(o.mayors.get("3550308")?.login).toBe("ana");
    expect(o.byLogin.has("duda")).toBe(false);
    expect(o.byLogin.get("bia")?.map((o) => officeLabel(o))).toEqual(["Governor of SP"]);
    expect([...o.byLogin.values()].every((os) => os.length === 1)).toBe(true);
  });
});
