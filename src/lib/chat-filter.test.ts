import { describe, expect, it } from "vitest";
import { ChatGuard, filterChat } from "./chat-filter";

describe("filterChat", () => {
  it("lets ordinary Portuguese through", () => {
    for (const t of ["bora correr até Campinas", "que carro massa", "cuidado com o poste", "pega o item ali", "alguém quer apostar corrida?", "kkkkk bati no prédio"]) {
      expect(filterChat(t).blocked, t).toBe(false);
    }
  });
  it("blocks links, scams and profanity", () => {
    for (const t of ["entra em meusite.com.br", "https://x.co/a", "manda pix aí", "vai se matar", "porra", "caralho mano", "fuck"]) {
      expect(filterChat(t).blocked, t).toBe(true);
    }
  });
  it("tones down floods and caps", () => {
    expect(filterChat("kkkkkkkkkkkkk").filtered).toBe("kkk");
    expect(filterChat("BORA CORRER GALERA").filtered).toBe("Bora correr galera");
  });
});

describe("ChatGuard", () => {
  it("paces, shadows repeats and mutes after five strikes", () => {
    const g = new ChatGuard();
    const T = 1_000_000;
    expect(g.check("a", "oi", T + 0)).toEqual({ kind: "send", text: "oi" });
    expect(g.check("a", "oi de novo", T + 500).kind).toBe("drop");
    expect(g.check("a", "oi", T + 1000).kind).toBe("send");
    expect(g.check("a", "oi", T + 2000).kind).toBe("send");
    expect(g.check("a", "oi", T + 3000)).toEqual({ kind: "shadow", text: "oi" });
    for (let i = 0; i < 4; i++) expect(g.check("a", "porra", T + 4000 + i * 1000).kind).toBe("shadow");
    expect(g.check("a", "tudo bem?", T + 9000).kind).toBe("drop");
    expect(g.check("a", "tudo bem?", T + 40_000).kind).toBe("send");
    expect(g.check("b", "oi", T + 9000).kind).toBe("send");
  });
});
