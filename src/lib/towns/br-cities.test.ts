import { describe, expect, it } from "vitest";
import { CAPITAL_OF, CITIES, NORONHA, cityBySlug, citySlug, normalize, resolveCity, searchCities } from "./br-cities";

const name = (r: ReturnType<typeof resolveCity>) => (r.kind === "city" ? `${r.city.name}/${r.city.uf}` : r.kind);

describe("brazil's cities", () => {
  it("has every municipality, a capital per state, and Noronha", () => {
    expect(CITIES.length).toBeGreaterThan(5560);
    expect(CAPITAL_OF.size).toBe(27);
    expect(CITIES.find((c) => c.ibge === NORONHA)?.name).toBe("Fernando de Noronha");
  });

  it("gives every city its own link", () => {
    expect(new Set(CITIES.map(citySlug)).size).toBe(CITIES.length);
    expect(cityBySlug("campinas-sp")?.ibge).toBe(3509502);
    expect(citySlug(cityBySlug("sao-jose-dos-campos-sp")!)).toBe("sao-jose-dos-campos-sp");
  });

  it("normalizes accents, case and punctuation", () => {
    expect(normalize("  São José-dos  Campos! ")).toBe("sao jose dos campos");
  });
});

describe("resolveCity", () => {
  it("finds a city however it's written", () => {
    expect(name(resolveCity("Campinas"))).toBe("Campinas/SP");
    expect(name(resolveCity("sao jose dos campos"))).toBe("São José dos Campos/SP");
    expect(name(resolveCity("campinas - sp"))).toBe("Campinas/SP");
    expect(name(resolveCity("sou de Ribeirão Preto"))).toBe("Ribeirão Preto/SP");
  });

  it("knows nicknames", () => {
    expect(name(resolveCity("sampa"))).toBe("São Paulo/SP");
    expect(name(resolveCity("Floripa"))).toBe("Florianópolis/SC");
    expect(name(resolveCity("BH"))).toBe("Belo Horizonte/MG");
    expect(name(resolveCity("poa"))).toBe("Porto Alegre/RS");
    expect(name(resolveCity("Noronha"))).toBe("Fernando de Noronha/PE");
  });

  it("forgives typos", () => {
    expect(name(resolveCity("campinsa"))).toBe("Campinas/SP");
    expect(name(resolveCity("Florianopols"))).toBe("Florianópolis/SC");
    expect(name(resolveCity("xyzzyplugh"))).toBe("none");
  });

  it("asks which when a name is in several states, unless the state or a capital settles it", () => {
    expect(resolveCity("Santa Rita").kind).toBe("ambiguous");
    expect(name(resolveCity("Santa Rita", "PB"))).toBe("Santa Rita/PB");
    expect(name(resolveCity("santa rita ma"))).toBe("Santa Rita/MA");
    // Several "Bonito"s; none is a capital.
    expect(resolveCity("Bonito").kind).toBe("ambiguous");
    // A state that hasn't got it: the name alone.
    expect(name(resolveCity("Campinas", "RJ"))).toBe("Campinas/SP");
  });

  it("doesn't read a state's sigla as a city", () => {
    expect(resolveCity("SP").kind).toBe("none");
  });
});

describe("searchCities", () => {
  it("puts the exact name, then lived-in cities, first", () => {
    expect(searchCities("campinas")[0].name).toBe("Campinas");
    const sj = searchCities("são j", 5, (ibge) => (ibge === 3549904 ? 9 : 0));
    expect(sj[0].name).toBe("São José dos Campos");
  });
});
