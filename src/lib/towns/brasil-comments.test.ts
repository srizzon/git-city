import { describe, expect, it } from "vitest";
import { parseComment, replyFor } from "./brasil-comments";

describe("parseComment", () => {
  it.each([
    ["@srizzon SP", { login: "srizzon", uf: "SP", place: null }],
    ["srizzon sp", { login: "srizzon", uf: "SP", place: null }],
    ["SP @srizzon", { login: "srizzon", uf: "SP", place: null }],
    ["github.com/srizzon - São Paulo", { login: "srizzon", uf: "SP", place: null }],
    ["https://github.com/torvalds RJ", { login: "torvalds", uf: "RJ", place: null }],
    ["sou de Recife PE @maria-dev", { login: "maria-dev", uf: "PE", place: "sou de recife" }],
    ["@joao rio grande do sul", { login: "joao", uf: "RS", place: null }],
    ["coloca eu aqui @ana-b, Minas Gerais", { login: "ana-b", uf: "MG", place: null }],
    ["@pedro", { login: "pedro", uf: null, place: null }],
    ["Bahia!", { login: null, uf: "BA", place: null }],
    ["top demais kkkk", { login: null, uf: null, place: null }],
    ["Slickinh0", { login: "slickinh0", uf: null, place: null }],
    ["Codyte ", { login: "codyte", uf: null, place: null }],
    ["top", { login: null, uf: null, place: null }],
    ["Incrível", { login: null, uf: null, place: null }],
    ["Brabo!!", { login: null, uf: null, place: null }],
    ["kkkkkk", { login: null, uf: null, place: null }],
    ["srizzon São Paulo", { login: "srizzon", uf: "SP", place: null }],
    ["Codyte demais", { login: null, uf: null, place: null }],
    ["srizzon campinas", { login: "srizzon", uf: null, place: "campinas" }],
    ["@ana-b São José dos Campos", { login: "ana-b", uf: null, place: "sao jose dos campos" }],
    ["joao floripa", { login: "joao", uf: null, place: "floripa" }],
    ["maria santa rita PB", { login: "maria", uf: "PB", place: "santa rita" }],
    // The reels' ask: the user without an @, the city or state, and a friend tagged with one.
    ["seuuser Campinas @amigo", { login: "seuuser", uf: null, place: "campinas" }],
    ["seuuser SP @amigo", { login: "seuuser", uf: "SP", place: null }],
    ["joao floripa @maria @pedro", { login: "joao", uf: null, place: "floripa" }],
    ["srizzon São Paulo @maria", { login: "srizzon", uf: "SP", place: null }],
    ["@amigo seuuser campinas", { login: "seuuser", uf: null, place: "campinas" }],
    ["@srizzon SP @maria", { login: "srizzon", uf: "SP", place: null }],
    ["@srizzon campinas @maria", { login: "srizzon", uf: null, place: "campinas" }],
  ])("%s", (text, want) => {
    expect(parseComment(text)).toEqual(want);
  });

  it("never takes a state's sigla for a username", () => {
    expect(parseComment("SP")).toEqual({ login: null, uf: "SP", place: null });
    expect(parseComment("df @dev")).toEqual({ login: "dev", uf: "DF", place: null });
  });

  it("refuses what can't be a GitHub login", () => {
    expect(parseComment("@-bad- SP").login).toBeNull();
    expect(parseComment("@nome_com_underscore SP").login).toBeNull();
  });
});

describe("replyFor", () => {
  it("speaks Portuguese and names the state, or the island", () => {
    expect(replyFor("added", "srizzon", "SP")).toContain("em São Paulo");
    expect(replyFor("added", "srizzon", null)).toContain("na ilha");
  });
  it("on a city reel, talks about the city", () => {
    expect(replyFor("added", "srizzon", null, "city")).toMatch(/Git City|cidade/);
    expect(replyFor("unknown_user", "x", null, "city")).toContain("GitHub");
  });
  it("never tags anyone: no @ before the login", () => {
    for (const o of ["added", "already", "unknown_user"]) for (const k of ["brasil", "city"] as const) expect(replyFor(o, "srizzon", "SP", k)).not.toContain("@");
  });
  it("words it differently for different logins, the same for one", () => {
    const lines = new Set(["a", "bb", "ccc", "dddd", "eeeee", "ffffff"].map((l) => replyFor("added", l, null, "city")!.replace(l, "")));
    expect(lines.size).toBeGreaterThan(1);
    expect(replyFor("added", "srizzon", "SP")).toBe(replyFor("added", "srizzon", "SP"));
  });
  it("stays quiet on comments without a username", () => {
    expect(replyFor("no_login", null, null)).toBeNull();
    expect(replyFor("blocked", "x", "SP")).toBeNull();
  });
});

describe("parseComment in a reply", () => {
  it("skips the account's own @ and the @ a reply starts with", () => {
    expect(parseComment("@samuelrizzondev Slickinh0", { ignore: ["samuelrizzondev"], reply: true }).login).toBe("slickinh0");
    expect(parseComment("@samuelrizzondev", { ignore: ["samuelrizzondev"] }).login).toBeNull();
    expect(parseComment("@amigo valeu", { reply: true }).login).toBeNull();
  });
  it("asks about a suggestion in the wording confirmedLogin reads back", () => {
    expect(replyFor("unknown_user", "slickinh0", null, "city", "slickinho")).toContain("É o slickinho?");
  });
});

describe("ptState", () => {
  it("puts the article Portuguese wants", async () => {
    const { ptState } = await import("./brasil-map");
    expect(ptState("AC", "the")).toBe("o Acre");
    expect(ptState("BA", "in")).toBe("na Bahia");
    expect(ptState("SP", "in")).toBe("em São Paulo");
    expect(ptState("RJ", "of")).toBe("do Rio de Janeiro");
    expect(replyFor("added", "srizzon", "AC")).toContain("no Acre");
  });
});

describe("replyFor with cities", () => {
  it("names the city, and the founder", () => {
    expect(replyFor("added", "srizzon", "SP", "brasil", null, { city: "Campinas", founded: false })).toContain("em Campinas");
    expect(replyFor("added", "srizzon", "SP", "brasil", null, { city: "Campinas", founded: true })).toContain("Campinas");
    expect(replyFor("added", "srizzon", "SP", "brasil", null, { city: "Campinas", founded: true })).toMatch(/fund/);
  });
  it("asks which city when the name is in several states, in words answeredCity reads back", () => {
    const r = replyFor("which_city", "joao", null, "brasil", null, { city: "Santa Rita", founded: false, options: ["MA", "PB"] })!;
    expect(r).toBe("joao, qual Santa Rita? Tem em MA e PB. Responde com o estado que eu coloco 😉");
    expect(r).not.toContain("@");
  });
});
