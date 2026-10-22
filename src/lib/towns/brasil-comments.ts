// ─── Brasil town: reading a comment ─────────────────────────
// What someone wrote under a reel, as the GitHub username and the city (or
// just the state) to put on the map. People write it every way: "@login SP", "login sp",
// "github.com/login - São Paulo", "SP: login", "sou de Recife PE @login".
// The username: a github.com/ link first, else a bare word next to a state
// or a city when it's the only thing it could be (the reels ask for the user
// without an @, and an @ beside it is a friend being tagged: "joao campinas
// @maria"), else the first @handle, else a bare word that is the whole comment. The state: a
// UF on its own, or a state's name. The place: what's left once the username
// and the filler are gone, when it reads as a city (br-cities). An
// @handle may be an Instagram handle rather than a GitHub one; the importer
// checks GitHub before placing anyone. Pure.

import { STATES, parseUF, ptState, type UF } from "./brasil-map";
import { resolveCity } from "./br-cities";

export interface ParsedComment {
  login: string | null;
  uf: UF | null;
  /** The words naming their city, as written ("campinas"), for resolveCity; null when it names none. */
  place: string | null;
}

/** A GitHub login: letters, digits and single hyphens, 39 at most, no hyphen at either end. */
const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Words that are never a username in these comments (Portuguese and English filler, the ask itself). */
const NOT_LOGINS = new Set([
  "eu", "sou", "de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "meu", "minha", "aqui", "estado", "cidade", "github", "user", "usuario",
  "me", "coloca", "coloque", "bota", "quero", "por", "favor", "pf", "pfv", "obrigado", "obrigada", "vlw", "valeu", "ai", "ae", "manda", "the", "my",
  "is", "from", "in", "im", "i", "am", "please", "add", "put", "here", "brasil", "brazil", "sim", "top", "show", "massa", "kkk", "kkkk", "haha",
  // Reactions people leave on their own, which would put a stranger called "brabo" on the map.
  "brabo", "braba", "foda", "parabens", "incrivel", "sensacional", "demais", "lindo", "perfeito", "amei", "genial", "insano", "mano", "cara",
  "nice", "wow", "cool", "great", "awesome", "insane", "amazing", "first", "primeiro", "link", "ok", "quero", "eu", "bora", "boa", "dahora",
]);
const LAUGH = /^(k{2,}|(ha){2,}h?|(rs){2,}|(he){2,})$/;

const STATE_NAMES: [string, UF][] = STATES.map((s) => [fold(s.name), s.uf] as [string, UF]).sort((a, b) => b[0].length - a[0].length);

/** How many words a comment has besides its username, its state and its place. */
function leftover(text: string, r: ParsedComment): number {
  const state = r.uf ? fold(STATES.find((s) => s.uf === r.uf)?.name ?? "") : "";
  const known = new Set([r.login, r.uf?.toLowerCase(), ...state.split(" "), ...fold(r.place ?? "").split(" ")]);
  return fold(text).split(/[\s,;:|/()!?.]+/).map((w) => w.replace(/^[-@]+|-+$/g, "")).filter((w) => w && !known.has(w)).length;
}

/**
 * The model's reading of a comment, checked against the rules': a login it took from a friend's tag
 * (an @handle with nothing else, or the start of an Instagram handle like "@guilherme.ia") gives way to
 * the rules, and when it finds no login but the rules find one next to a place, the rules win.
 */
export function pickReading<T extends ParsedComment>(text: string, model: T | null, rules: ParsedComment): T | ParsedComment {
  if (!model) return rules;
  // The rules' username written beside a place beats a different one from the model, which drops a
  // digit ("Luisdbrito7 Maranhão" → luisdbrito) or takes the city ("Frutal mg / AlbertoGRB" → frutal).
  if (rules.login && (rules.uf || rules.place) && model.login && model.login !== rules.login) return rules;
  if (model.login) {
    const handles = [...text.toLowerCase().matchAll(/@([a-z0-9._]+)/g)].map((m) => m[1]);
    const insideIgHandle = handles.some((h) => h !== model.login && h.startsWith(model.login!) && /[._]/.test(h));
    const tagOnly = handles.length > 0 && !model.uf && !model.place && !rules.login;
    if (insideIgHandle || tagOnly) return rules;
  }
  // A model that finds no username loses to the rules only in a short comment: in a sentence ("Obrigado por
  // segurar Pernambuco") the word beside the state is just a word.
  if (!model.login && rules.login && (rules.uf || rules.place) && leftover(text, rules) <= 1) return rules;
  return model;
}

/**
 * `loneHandle`: a comment that is one @handle and nothing else is the commenter's own username (someone
 * not on the map yet answering the reel); otherwise it tags a friend.
 */
export function parseComment(text: string, opts: { ignore?: string[]; reply?: boolean; loneHandle?: boolean } = {}): ParsedComment {
  let raw = text.trim();
  // The @ Instagram puts at the start of a reply is never the username (taken first: it's often the
  // account's own, and "@account @login João Pessoa" must keep the login), nor the account's own @.
  if (opts.reply) raw = raw.replace(/^@[a-z0-9._]+\s*/i, "").trim();
  for (const handle of opts.ignore ?? []) raw = raw.replace(new RegExp(`@${handle.replace(/[.]/g, "\\.")}\\b`, "gi"), " ").trim();
  const lower = fold(raw);

  // The state: a full name first ("rio grande do sul" before "rio de janeiro" can't clash: longest first), else a UF word.
  let uf: UF | null = null;
  let rest = lower;
  for (const [name, code] of STATE_NAMES) {
    const at = rest.indexOf(name);
    if (at >= 0 && (at === 0 || /[^a-z0-9]/.test(rest[at - 1])) && (at + name.length === rest.length || /[^a-z0-9]/.test(rest[at + name.length]))) {
      uf = code;
      rest = rest.slice(0, at) + " " + rest.slice(at + name.length);
      break;
    }
  }

  // The username: a github.com link, else an @handle, else a plain word.
  let login: string | null = null;
  const link = /github\.com\/([a-z0-9-]+)/i.exec(rest);
  if (link && GITHUB_LOGIN.test(link[1].toLowerCase())) login = link[1].toLowerCase();
  // Instagram handles come out whole first ("@vitor.mb_" is one handle, never "@vitor"): one with a dot or an
  // underscore can't be a GitHub login, so it's only ever a friend being tagged.
  let igOnly = false;
  const noLink = rest.replace(/github\.com\/[a-z0-9-]+/gi, " ").replace(/@([a-z0-9._-]+)/g, (_, h: string) => {
    const handle = h.replace(/[._]+$/, "");
    if (GITHUB_LOGIN.test(handle) && handle === h) return ` @${handle} `;
    igOnly = true;
    return " ";
  });
  // "ralfferreira- João Pessoa", "viniciusssjbk -SP": a hyphen at a word's edge is punctuation.
  const words = noLink.replace(/(^|\s)-+|-+(?=\s|$)/g, " ").split(/[\s,;:|/()!?.]+/).filter(Boolean);
  if (!uf) {
    for (const w of words) {
      const code = parseUF(w.replace(/^@/, ""));
      if (code && w.length === 2) {
        uf = code;
        break;
      }
    }
  }
  // @handles are friends being tagged when a bare word next to the place is the username.
  const tagged = igOnly || words.some((w) => w.startsWith("@"));
  const bare = words.filter((w) => !w.startsWith("@"));
  // A bare word counts when it's the whole comment ("srizzon": how most people answer), or next
  // to a state with nothing else it could be ("srizzon sp"), so a comment like "top demais" never
  // puts a stranger called "demais" on the map.
  // As written: a word typed with accents ("Incrível") was never a username.
  const typed = new Set(raw.toLowerCase().split(/[\s,;:|/()!?.]+/));
  const plain = words.filter((w) => typed.has(w) && GITHUB_LOGIN.test(w) && !NOT_LOGINS.has(w) && !LAUGH.test(w) && !(w.length === 2 && parseUF(w)) && !/^\d+$/.test(w));
  // What's left naming a city, once the username (and any state's sigla) is out.
  const placeWithout = (out: string | null) => {
    const rest = words.filter((w) => w !== out && !w.startsWith("@") && !(w.length === 2 && parseUF(w))).join(" ");
    return rest && resolveCity(rest, uf).kind !== "none" ? rest : null;
  };
  // A place named exactly, in the state written (or a short nickname: "bh", "poa").
  const exactPlace = (text: string) => {
    const r = resolveCity(text, uf);
    return r.kind === "city" && (fold(r.city.name) === text || text.length <= 4) && (!uf || r.city.uf === uf);
  };
  // With a friend tagged, only "user UF @friend": nothing but the word and the state besides the @s.
  const besideState = bare.filter((w) => !(w.length === 2 && parseUF(w)));
  // "@rinaldovilela Recife Pernambuco", "@ana Belo Horizonte MG": every bare word is the place, so the @ is the user.
  const allPlace = besideState.length > 0 && exactPlace(besideState.join(" "));
  if (!login && !allPlace && uf && plain.length === 1 && (!tagged || besideState.length === 1)) login = plain[0];
  // "MuriloDev07 Paraíba, não sei se já adicionou": next to a state, the one word written like a login
  // (a digit, a hyphen, a capital inside it) among Portuguese ones.
  if (!login && !allPlace && uf && plain.length > 1) {
    const loginish = new Set(raw.split(/[\s,;:|/()!?.]+/).filter((w) => /\d|-|[a-z][A-Z]/.test(w)).map((w) => w.toLowerCase()));
    const like = plain.filter((w) => loginish.has(w));
    if (like.length === 1) login = like[0];
  }
  // "srizzon campinas" (and "srizzon campinas @maria"): the one word whose removal leaves a city is the username.
  if (!login && !allPlace && bare.length > 1) {
    const fits = plain.filter((w) => placeWithout(w));
    // A typo-close city ("agustin" → Adustina, BA) loses to the one named exactly, in the state written.
    const exact = fits.filter((w) => exactPlace(placeWithout(w)!));
    if (fits.length === 1) login = fits[0];
    else if (exact.length === 1) login = exact[0];
  }
  // An @handle is the username only next to a place ("@joao SP", "@ana campinas"): on its own it tags a friend.
  if (!login && (uf || bare.some((w) => !(w.length === 2 && parseUF(w))))) {
    const handle = words.find((w) => w.startsWith("@") && GITHUB_LOGIN.test(w.slice(1)) && (uf || placeWithout(w.slice(1))));
    if (handle) login = handle.slice(1);
  }
  if (!login && opts.loneHandle && words.length === 1 && words[0].startsWith("@") && !igOnly && GITHUB_LOGIN.test(words[0].slice(1))) login = words[0].slice(1);
  // A bare word that is the whole comment, never next to a friend's tag ("voto @gemison.x07", "@p.ferraz3 up").
  if (!login && !tagged && words.length === 1 && plain.length === 1) login = plain[0];
  const place = login ? placeWithout(login) : null;
  return { login, uf, place };
}

/** Where the reply says they are: their city, and whether they just founded it; or, for "which_city", the states that share the name. */
export interface ReplyPlace {
  city: string | null;
  founded: boolean;
  options?: UF[];
}

/** "MA, PB e SE". */
const list = (ufs: string[]) => (ufs.length > 1 ? `${ufs.slice(0, -1).join(", ")} e ${ufs[ufs.length - 1]}` : (ufs[0] ?? ""));

/**
 * The reply under a comment once it's imported, in Portuguese and in Sam's
 * voice (his reels are in Portuguese), or null when it gets none (no
 * username: most comments are just comments; the rest would read as spam).
 * The GitHub login goes without an @: on Instagram an @ tags whoever owns
 * that handle there. Each reply has a few wordings, picked by the login, so
 * a hundred replies don't read as one copied line.
 */
export function replyFor(outcome: string, login: string | null, uf: UF | null, kind: "brasil" | "city" = "brasil", suggestion: string | null = null, place: ReplyPlace | null = null): string | null {
  // FNV-1a over the login, so neighbouring logins land on different wordings.
  const hash = [...(login ?? "")].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const pick = (lines: string[]) => lines[hash % lines.length];
  const where = place?.city ? `em ${place.city}` : uf ? ptState(uf, "in") : "na ilha";
  // "É o X?" is read back by confirmedLogin (comment-ai.ts) when they answer "sim": keep the wording.
  if (outcome === "unknown_user" && suggestion) return `Não achei o ${login} no GitHub 🤔 É o ${suggestion}? Responde "sim" que eu coloco`;
  if (outcome === "unknown_user") return pick([`Não achei o ${login} no GitHub 😕 Confere o user e comenta de novo`, `Hmm, ${login} não existe no GitHub. Confere aí e manda de novo!`, `Não encontrei ${login} no GitHub 🤔 Vê se o user tá certinho e comenta de novo`]);
  // "login, qual X? Tem em" is read back by answeredCity (comment-ai.ts): keep the wording.
  if (outcome === "which_city" && place?.city && place.options?.length) return `${login}, qual ${place.city}? Tem em ${list(place.options)}. Responde com o estado que eu coloco 😉`;
  if (kind === "city") {
    if (outcome === "added") return pick([`Pronto! O prédio do ${login} já tá na Git City 🏙️ Link na bio pra ver`, `Feito! ${login} já tem prédio na cidade 🏙️ Corre no link da bio`, `Tá na mão! Prédio do ${login} subiu na Git City 🏙️ Link na bio`]);
    if (outcome === "already") return pick([`O ${login} já tinha prédio na cidade! Link na bio pra achar 🏙️`, `${login} já tá na Git City faz tempo 😎 Link na bio pra ver seu prédio`, `Esse já tava lá! Prédio do ${login} no link da bio 🏙️`]);
    return null;
  }
  if (outcome === "added" && place?.founded && place.city) return pick([`${login} fundou ${place.city} no mapa 🏙️ Primeiro dev de lá! Link na bio`, `Pronto! ${place.city} agora existe no mapa, fundada pelo ${login} 🇧🇷 Link na bio`, `Feito! ${login} é o fundador de ${place.city} 🏙️ Chama a galera de lá. Link na bio`]);
  if (outcome === "added") return pick([`Pronto! ${login} tá no mapa ${where} 🏙️ Link na bio pra ver seu prédio`, `Feito! Prédio do ${login} subiu ${where} 🇧🇷 Corre no link da bio`, `Tá no mapa! ${login} agora mora ${where} 🏙️ Link na bio`]);
  if (outcome === "already") return pick([`O ${login} já tava no mapa! Link na bio pra achar seu prédio 🏙️`, `${login} já mora no mapa 😎 Link na bio pra ver`, `Esse já tava lá! Prédio do ${login} no link da bio 🇧🇷`]);
  return null;
}

// ─── A vote in a comment ────────────────────────────────────
// "voto 53", "53", "vou de 32", "meu voto é o 01": a comment that is a ballot
// number (with only voting words round it) votes for president, as the
// Instagram account's dev on the map (brasil-instagram.ts). Anything else
// stays a comment.

const VOTE = /^(?:(?:meu\s+)?voto(?:\s+(?:é|e|no|na|pro|pra))?(?:\s+o)?|vou\s+de|vote|é\s+o|#|n[ºo°]\.?)?\s*(\d{1,2})\s*[!.🗳️✅👍🔥💚]*$/iu;

/** The ballot number a comment votes for, or null when it isn't a vote. */
export function parseVote(text: string): number | null {
  const m = VOTE.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 99 ? n : null;
}

// A vote among other words: "IanAkiles Manaus 32" (joining and voting at
// once), "Vamos votar kkkkkk 32", "Boraaa de 01!!", "Bora @amigo 34 🔥". One
// ballot number on its own in the comment (keycaps like 0️⃣1️⃣ count), never
// part of a word, a time or an age ("21h", "53 anos"). `worded`: a voting word
// is in it, so it reads as a vote even where comments are for joining.

const VOTE_WORDS = /(?:^|[^\p{L}])(?:vot\p{L}*|n[uú]mero|candidat\p{L}*|bora+\s+de|vou\s+de|fechad[oa]\s+com|é\s+o)(?![\p{L}])/iu;
const BALLOT = /(?<![\p{L}\p{N}@#/.,:_-])(?<!R\$\s*)(\d{1,2})(?![\p{L}\p{N}]|[.,:]\d|\s*(?:anos?|%|mil|reais|horas?|min)(?![\p{L}]))/giu;

export interface VoteInText {
  number: number;
  /** The comment without the number and the voting words: a username and a city, maybe. */
  rest: string;
  worded: boolean;
}

/** A ballot number inside a longer comment, or null when it has none or more than one. */
export function voteIn(text: string): VoteInText | null {
  const t = text.replace(/(\d)\uFE0F?\u20E3/g, "$1");
  const found = [...t.matchAll(BALLOT)].map((m) => Number(m[1]));
  const distinct = [...new Set(found)];
  if (distinct.length !== 1 || distinct[0] < 1 || distinct[0] > 99) return null;
  const rest = t
    .replace(BALLOT, " ")
    .replace(new RegExp(VOTE_WORDS.source, "giu"), " ")
    .replace(/[!🗳️✅👍🔥💚😂—-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { number: distinct[0], rest, worded: VOTE_WORDS.test(t) };
}

/** Whether the ballot number is the comment's last word (only emoji and punctuation after it). */
const closesWith = (text: string, n: number) => new RegExp(`(?<![\\p{L}\\p{N}])0?${n}[^\\p{L}\\p{N}]*$`, "u").test(text.replace(/(\d)\uFE0F?\u20E3/g, "$1"));

/**
 * Whether a comment votes, and with what: a bare number always does; a number among other words does
 * with a voting word, or next to a username (joining and voting at once), on any post. Only the
 * number closing a comment on a post that isn't for joining (`watched` false) votes without them
 * ("Bora @amigo 34"): any of the account's posts gets comments like "Coloca 1 NPC", a count, not a
 * vote. `join`: the words to join with, when they name a username. `loose` votes only count when
 * the number is a candidate's (the caller checks), so "a 32 do meu time" doesn't vote for a stranger.
 */
export function voteRoute(text: string, watched: boolean): { number: number; join: string | null; loose: boolean } | null {
  const strict = parseVote(text);
  if (strict !== null) return { number: strict, join: null, loose: false };
  const v = voteIn(text);
  if (!v) return null;
  // An @ in a vote is a friend being called to vote ("Bora @amigo 34"), never the commenter's username.
  const rest = v.rest.replace(/@[a-z0-9._-]+/gi, " ").replace(/\s+/g, " ").trim();
  const join = rest && parseComment(rest).login ? rest : null;
  if (v.worded || join || (!watched && closesWith(text, v.number))) return { number: v.number, join, loose: true };
  return null;
}

/**
 * The reply to a vote: "voted" (with the candidate's login; `joined`: the same comment just put them
 * on the map), "unlinked" (the Instagram account isn't on the map yet: their answer puts them there and
 * counts this vote), or a refusal: "number" (nobody has it), "young" (GitHub account too new), "closed".
 */
export function voteReply(outcome: "voted" | "unlinked" | "number" | "young" | "closed", number: number, login: string | null = null, joined: { login: string; where: string } | null = null): string {
  const nn = String(number).padStart(2, "0");
  if (outcome === "voted" && joined) return `Pronto! ${joined.login} tá no mapa ${joined.where} e seu voto no ${nn}${login ? ` (${login})` : ""} tá registrado 🗳️ Dá pra trocar até domingo, 21h`;
  if (outcome === "voted") return `Voto no ${nn}${login ? ` (${login})` : ""} registrado 🗳️ Dá pra trocar até domingo, 21h`;
  if (outcome === "unlinked") return `Seu Instagram ainda não tá no mapa 😕 Responde aqui com seu user do GitHub e sua cidade (ex: seuuser Recife) que eu te coloco e conto seu voto no ${nn}`;
  if (outcome === "number") return `Não tem candidato ${nn} 🤔 Os números tão na urna, no link da bio`;
  if (outcome === "young") return `Sua conta do GitHub precisa ter 30 dias pra votar 😕`;
  return `A votação não tá aberta agora`;
}
