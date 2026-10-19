import { describe, expect, it } from "vitest";
import { answeredCity, confirmedLogin } from "./comment-ai";
import { replyFor } from "./brasil-comments";

const asked = [
  { who: "them" as const, text: "Slickinh0" },
  { who: "us" as const, text: 'Não achei o slickinh0 no GitHub 🤔 É o slickinho? Responde "sim" que eu coloco' },
];

describe("confirmedLogin", () => {
  it("takes a yes to our suggestion", () => {
    for (const yes of ["sim", "Sim!", "@samuelrizzondev sim", "isso", "👍", "é esse"]) expect(confirmedLogin(yes, "samuelrizzondev", asked)).toBe("slickinho");
  });
  it("ignores anything else, and a yes with no suggestion", () => {
    expect(confirmedLogin("não, é slickinh00", "samuelrizzondev", asked)).toBeNull();
    expect(confirmedLogin("sim", "samuelrizzondev", [{ who: "us", text: "Pronto! O prédio do codyte já tá na Git City" }])).toBeNull();
    expect(confirmedLogin("sim", "samuelrizzondev", [])).toBeNull();
  });
});

describe("answeredCity", () => {
  const asked = [{ who: "them" as const, text: "joao santa rita" }, { who: "us" as const, text: replyFor("which_city", "joao", null, "brasil", null, { city: "Santa Rita", founded: false, options: ["MA", "PB"] })! }];
  it("reads the state they answer under our question", () => {
    expect(answeredCity("PB", "samuelrizzondev", asked)).toEqual({ login: "joao", place: "Santa Rita", uf: "PB" });
    expect(answeredCity("@samuelrizzondev a da paraíba", "samuelrizzondev", asked)).toEqual({ login: "joao", place: "Santa Rita", uf: "PB" });
  });
  it("ignores answers with no state, and threads where we didn't ask", () => {
    expect(answeredCity("sei la", "samuelrizzondev", asked)).toBeNull();
    expect(answeredCity("PB", "samuelrizzondev", [{ who: "us", text: "Pronto!" }])).toBeNull();
  });
});
