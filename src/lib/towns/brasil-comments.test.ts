import { describe, expect, it } from "vitest";
import { parseComment, parseVote, pickReading, replyFor, voteIn, voteReply, voteRoute } from "./brasil-comments";

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
    // An @ alone tags a friend (the reels ask for "seuuser Cidade" and "@amigo" for friends).
    ["@pedro", { login: null, uf: null, place: null }],
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
    // Real comments under Brasil Dia 2 (2026-10-19).
    ["@vitor.mb_", { login: null, uf: null, place: null }],
    ["@l.costadias", { login: null, uf: null, place: null }],
    ["@julinhodev", { login: null, uf: null, place: null }],
    ["@luisphillipe87 @matheus_fontenele", { login: null, uf: null, place: null }],
    ["@offthype rodou ?", { login: null, uf: null, place: null }],
    ["Cigano-agi, Blumenau \n\n@guilhermearoxo.ia", { login: "cigano-agi", uf: null, place: "blumenau" }],
    ["Agustin mineiros go", { login: "agustin", uf: "GO", place: "mineiros" }],
    ["MuriloDev07 Paraíba, não sei se já adicionou", { login: "murilodev07", uf: "PB", place: null }],
    ["@millersantosbr Maceió", { login: "millersantosbr", uf: null, place: "maceio" }],
  ])("%s", (text, want) => {
    expect(parseComment(text)).toEqual(want);
  });

  it("reads a lone @ as the commenter's username only when asked (they aren't on the map yet)", () => {
    expect(parseComment("@chicoduartec", { loneHandle: true }).login).toBe("chicoduartec");
    expect(parseComment("@chicoduartec").login).toBeNull();
    expect(parseComment("@vitor.mb_", { loneHandle: true }).login).toBeNull();
    expect(parseComment("@a @b", { loneHandle: true }).login).toBeNull();
    expect(parseComment("voto @gemison.x07").login).toBeNull();
    expect(parseComment("@p.ferraz3 up").login).toBeNull();
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

describe("pickReading", () => {
  const none = { login: null, uf: null, place: null };
  it("drops a login the model took from a friend's tag", () => {
    expect(pickReading("@offthype rodou ?", { login: "rodou", uf: null, place: null }, none).login).toBeNull();
    expect(pickReading("@luisphillipe87 @matheus_fontenele", { login: "luisphillipe87", uf: null, place: null }, none).login).toBeNull();
  });
  it("drops a login cut out of an Instagram handle", () => {
    const rules = { login: "cigano-agi", uf: null, place: "blumenau" };
    expect(pickReading("Cigano-agi, Blumenau @guilhermearoxo.ia", { login: "guilhermearoxo", uf: null, place: null }, rules)).toEqual(rules);
  });
  it("takes the rules' login next to a place when the model finds none", () => {
    const rules = { login: "agustin", uf: "GO" as const, place: "mineiros" };
    expect(pickReading("Agustin mineiros go", { login: null, uf: "GO", place: "mineiros" }, rules)).toEqual(rules);
  });
  it("keeps the model's reading otherwise", () => {
    const model = { login: "millersantosbr", uf: "AL" as const, place: "Maceió" };
    expect(pickReading("@millersantosbr Maceió", model, { login: "millersantosbr", uf: null, place: "maceio" })).toBe(model);
  });
});

describe("parseVote", () => {
  it.each([
    ["53", 53],
    ["voto 53", 53],
    ["Voto no 32", 32],
    ["meu voto é o 01", 1],
    ["vou de 32!", 32],
    ["#53", 53],
    ["01 🗳️", 1],
    ["nº 53", 53],
  ])("%s votes %i", (text, n) => expect(parseVote(text)).toBe(n));

  it.each(["srizzon SP", "53 anos de código", "sp 32", "0", "100", "votei no guanabara", "seuuser 53"])("%s isn't a vote", (text) => expect(parseVote(text)).toBeNull());
});

// Eval: every comment on the vote post (2026-10-20) that wasn't a bare number, and what it should count as.
describe("voteIn, the vote post's comments", () => {
  it.each([
    ["Eu voto no desconhecido então, número 53", 53, true],
    ["devWelby 48 — O dev que o Brasil precisa! Menos bugs, mais features. Menos reuniões, mais entregas. Mais café, menos exceptions. Votem 48", 48, true],
    ["Boraaaaaa de 01!! kkk kk #RizzonPresidente", 1, true],
    ["Vamos votar kkkkkk 32", 32, true],
    ["Bora @manodeyvin 34 🔥😂", 34, false],
    ["IanAkiles Manaus 32", 32, false],
    ["@gustavoguanabara (vote 46)", 46, true],
    ["Vote 01. Minha proposta é ter bolsa claude para todos os devs! 0️⃣1️⃣", 1, true],
    ["seuuser 53", 53, false],
  ])("%s votes %i", (text, n, worded) => {
    const v = voteIn(text);
    expect(v?.number).toBe(n);
    expect(v?.worded).toBe(worded);
  });

  it("leaves the username and the city for joining", () => {
    expect(voteIn("IanAkiles Manaus 32")?.rest).toBe("IanAkiles Manaus");
    expect(voteIn("voto 32 srizzon Recife")?.rest).toBe("srizzon Recife");
  });

  it.each([
    "Onde vota?0",
    "@samuelrizzondev @Matte0dev João pessoa",
    "@samuelrizzondev  GustavoSousa01 Fortaleza",
    "@gustavoguanabara",
    "fecha domingo 21h",
    "tenho 32 anos",
    "32 ou 34?",
    "2026",
    "srizzon SP",
    "R$ 50",
  ])("%s has no vote", (text) => expect(voteIn(text)).toBeNull());
});

describe("parseComment, answers to our ask on the vote post", () => {
  it("keeps the login after the account's @ that starts a reply", () => {
    expect(parseComment("@samuelrizzondev @Matte0dev João pessoa", { ignore: ["samuelrizzondev"], reply: true, loneHandle: true })).toMatchObject({ login: "matte0dev" });
    expect(parseComment("@samuelrizzondev  GustavoSousa01 Fortaleza", { ignore: ["samuelrizzondev"], reply: true, loneHandle: true })).toMatchObject({ login: "gustavosousa01" });
  });
});

describe("voteRoute", () => {
  it("counts a number among words on the vote post, joining with the rest", () => {
    expect(voteRoute("IanAkiles Manaus 32", false)).toEqual({ number: 32, join: "IanAkiles Manaus", loose: true });
    // The @ is a friend called to vote, not the commenter.
    expect(voteRoute("Bora @manodeyvin 34 🔥😂", false)).toEqual({ number: 34, join: null, loose: true });
    expect(voteRoute("Eu voto no desconhecido então, número 53", false)).toEqual({ number: 53, join: null, loose: true });
  });
  it("on a join reel, needs a voting word or a username beside the number", () => {
    expect(voteRoute("Vamos votar kkkkkk 32", true)).toMatchObject({ number: 32 });
    expect(voteRoute("srizzon recife 32", true)).toMatchObject({ number: 32, join: "srizzon recife" });
    expect(voteRoute("top demais 10/10 kkk 32", true)).toBeNull();
  });
  it("a bare number is a vote anywhere, with nothing to join", () => {
    expect(voteRoute("53", true)).toEqual({ number: 53, join: null, loose: false });
  });
  it("a comment without a number isn't a vote", () => {
    expect(voteRoute("@samuelrizzondev  GustavoSousa01 Fortaleza", false)).toBeNull();
  });
});

describe("voteReply", () => {
  it("names the number on two digits and the candidate", () => {
    expect(voteReply("voted", 1, "srizzon")).toContain("Voto no 01 (srizzon) registrado");
  });
  it("tells an account off the map how to get on it, and that the vote waits", () => {
    expect(voteReply("unlinked", 53)).toContain("seuuser Recife");
    expect(voteReply("unlinked", 53)).toContain("53");
  });
  it("says both when one comment put them on the map and voted", () => {
    expect(voteReply("voted", 32, "gustavoguanabara", { login: "ianakiles", where: "em Manaus" })).toContain("ianakiles tá no mapa em Manaus e teu voto no 32 (gustavoguanabara)");
  });
});
