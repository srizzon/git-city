// ─── Brasil town: projects ──────────────────────────────────
// Devs on the map post what they built; anyone signed in upvotes it. A project
// competes in the points week it went live (Monday 00:00 UTC, Sunday 21h in
// Brasília, like the points and the offices), the week's top 3 sit in the
// map's top-right card and win points when it closes. One ad slot sits above
// them, booked by hand. Every link is screened before it shows
// (brasil-projects-check.ts); this file holds the rules that need no network:
// the fields, the link, the denylist, who counts as a voter, the ranking. Pure.

import type { Lang } from "@/lib/i18n/lang";
import { pointsWeek } from "./brasil-points";

export const CATEGORIES = [
  { id: "ai", label: "AI", pt: "IA" },
  { id: "devtool", label: "Dev tool", pt: "Dev tool" },
  { id: "webapp", label: "Web app", pt: "Web app" },
  { id: "mobile", label: "Mobile", pt: "Mobile" },
  { id: "game", label: "Game", pt: "Jogo" },
  { id: "library", label: "Library", pt: "Biblioteca" },
  { id: "other", label: "Other", pt: "Outro" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
export const categoryLabel = (id: string, lang: Lang = "en"): string => {
  const c = CATEGORIES.find((x) => x.id === id);
  return lang === "pt" ? (c?.pt ?? "Outro") : (c?.label ?? "Other");
};

export const LIMITS = {
  name: 40,
  tagline: 80,
  description: 500,
  url: 300,
  /** Projects a dev can launch in one week. */
  launchesPerWeek: 1,
  /** Projects a dev can have up (live or waiting) at once. */
  livePerDev: 3,
  /** Upvotes a dev can cast in an hour. */
  votesPerHour: 30,
  /** Reports from counted accounts that hide a project until the admin looks. */
  reportsToHide: 3,
  /** Refused tries in one week before posting closes until the next (no probing the checks). */
  refusalsPerWeek: 3,
  /** A project going live closer than this to the week's end competes the next week instead. */
  lateHours: 24,
} as const;

/** What the week's top 3 win, in Brasil points. */
export const POINTS_FOR_RANK: Record<1 | 2 | 3, number> = { 1: 100, 2: 50, 3: 25 };

/** A vote moves the rank only from a GitHub account this old, with some public activity. */
export const COUNTED_MIN_DAYS = 30;
/** The burst flag: this many votes on one project in BURST_MINUTES from accounts younger than BURST_YOUNG_DAYS. */
export const BURST = { votes: 10, minutes: 10, youngDays: 90 } as const;

export type ProjectStatus = "checking" | "live" | "review" | "rejected" | "hidden" | "removed";

export interface ProjectCard {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  host: string;
  repo: string | null;
  category: Category;
  icon: string | null;
  cover: string | null;
  uf: string | null;
  ibge: number | null;
  maker: { login: string; avatar: string | null };
  votes: number;
  visits: number;
  week: string | null;
  liveAt: number | null;
  /** The viewer upvoted it. */
  voted: boolean;
  /** Its rank in its week while that week is open, or its final rank once closed (1–3), else null. */
  rank: number | null;
}

export interface AdCard {
  id: number;
  name: string;
  tagline: string;
  url: string;
  icon: string | null;
}

/** The week a moment competes in (its Monday, UTC). */
export const projectWeek = (at: Date): string => pointsWeek(at);
/** When a week closes (the next Monday 00:00 UTC), in ms. */
export const weekClosesAt = (week: string): number => Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000;

/**
 * The week a project going live now competes in: this one, or the next when
 * fewer than LIMITS.lateHours are left (it would have minutes to gather votes).
 */
export function launchWeekFor(at: Date): string {
  const week = projectWeek(at);
  const closes = weekClosesAt(week);
  return closes - at.getTime() < LIMITS.lateHours * 3_600_000 ? projectWeek(new Date(closes)) : week;
}

/** The week whose slot a project used: the week it competes in, or would have when it was posted. */
export const slotWeekOf = (r: { launch_week: string | null; created_at: string }): string => r.launch_week ?? launchWeekFor(new Date(r.created_at));

/** When a week opens, for a person: "Sun 21:00 (Brasília) · in 3d". */
export function opensText(week: string, now = Date.now(), lang: Lang = "en"): string {
  const at = Date.parse(`${week}T00:00:00Z`);
  const when = new Date(at).toLocaleString(lang === "pt" ? "pt-BR" : "en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const h = Math.max(0, Math.ceil((at - now) / 3_600_000));
  return `${when} (Brasília) · ${lang === "pt" ? "em" : "in"} ${h >= 24 ? `${Math.floor(h / 24)}d` : `${h}h`}`;
}

// ─── The fields ─────────────────────────────────────────────

export interface ProjectInput {
  name: string;
  tagline: string;
  description: string;
  url: string;
  repo: string | null;
  category: Category;
}

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

/** The form's fields checked and trimmed, or the first thing wrong with them. */
export function readProjectInput(body: Record<string, unknown>): { input: ProjectInput } | { error: string } {
  const name = clean(body.name, LIMITS.name);
  const tagline = clean(body.tagline, LIMITS.tagline);
  const description = typeof body.description === "string" ? body.description.replace(/\r/g, "").trim().slice(0, LIMITS.description + 1) : "";
  if (name.length < 2) return { error: "Give it a name." };
  if (name.length > LIMITS.name) return { error: `The name fits ${LIMITS.name} characters.` };
  if (tagline.length < 5) return { error: "Say in a line what it does." };
  if (tagline.length > LIMITS.tagline) return { error: `The tagline fits ${LIMITS.tagline} characters.` };
  if (description.length > LIMITS.description) return { error: `The description fits ${LIMITS.description} characters.` };
  const url = normalizeUrl(typeof body.url === "string" ? body.url : "");
  if ("error" in url) return url;
  let repo: string | null = null;
  if (typeof body.repo === "string" && body.repo.trim()) {
    repo = normalizeRepo(body.repo);
    if (!repo) return { error: "The repo has to be a github.com/owner/name link." };
  }
  const category = typeof body.category === "string" && CATEGORY_IDS.has(body.category) ? (body.category as Category) : null;
  if (!category) return { error: "Pick a category." };
  return { input: { name, tagline, description, url: url.url, repo, category } };
}

// ─── The link ───────────────────────────────────────────────

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** A link as we store it: https, no credentials, port or fragment, the host lowercased. */
export function normalizeUrl(input: string): { url: string; host: string } | { error: string } {
  let raw = input.trim();
  if (!raw) return { error: "Paste the link to your project." };
  if (raw.length > LIMITS.url) return { error: "That link is too long." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { error: "That doesn't look like a link." };
  }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") return { error: "The link has to start with https://." };
  if (u.username || u.password || u.port) return { error: "Use the plain link, without a port or a login." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || IPV4.test(host) || host.startsWith("[")) return { error: "Use a link with a domain name." };
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return { error: "Use a public link." };
  u.hash = "";
  const url = u.toString().replace(/\/$/, "");
  return { url, host };
}

/** github.com/owner/name (any form of it) as https://github.com/owner/name, or null. */
export function normalizeRepo(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38})\/([a-z0-9._-]{1,100}?)(?:\.git)?\/?(?:[?#].*)?$/i);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

/** The repo a project's own link names, when the link is a GitHub repo. */
export const repoOfUrl = (url: string): string | null => normalizeRepo(url);

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at", "rb.gy", "t.ly", "tiny.cc", "s.id",
  "encurtador.com.br", "encurta.net", "abre.ai", "lnkd.in", "linktr.ee", "bio.link", "beacons.ai", "wa.me", "api.whatsapp.com", "chat.whatsapp.com", "t.me",
]);
const FILE_EXT = /\.(apk|aab|exe|msi|dmg|pkg|deb|rpm|zip|rar|7z|tar|gz|bat|cmd|scr|jar|ps1|sh|vbs|iso|img|bin)$/i;

/**
 * Words that mark gambling, the "tigrinho" slots and get-rich schemes in a
 * page or a form, matched on whole words. Generic words a real project uses
 * ("slot", "bet", "mines") are left to the domain check and the model.
 */
const DENY_WORDS = [
  "aposta", "apostas", "apostar", "cassino", "casino", "tigrinho", "tigre da sorte", "fortune tiger", "fortune ox", "fortune rabbit", "fortune mouse",
  "pg soft", "pgsoft", "jogo do bicho", "bet365", "betano", "blaze apostas", "bac bo", "bacbo",
  "renda extra", "ganhe dinheiro", "dinheiro facil", "dinheiro fácil", "pix gratis", "pix grátis", "lucro garantido", "rendimento garantido",
  "piramide financeira", "pirâmide financeira", "robô de trade", "robo de trade", "sinais vip", "grupo vip",
]
/** Domain labels that are betting or casino on their own ("pixbet", "bet365", "brazino777", "cassinopix"). */
const BET_LABEL = /^(\w*bet\d*|bet\d+\w*|\w*777\w*|\w*cassino\w*|\w*casino\w*|\w*tigrinho\w*|slots?|\w+slots?)$/;
/** Words that end in "bet" and aren't betting. */
const NOT_BET = new Set(["alphabet", "alfabet", "abet", "tibet", "sorbet", "barbet", "gibbet", "quodlibet"]);

/** Whether a host looks like a betting or casino site from its name alone. */
export function betHost(host: string): boolean {
  return host
    .toLowerCase()
    .split(/[.-]/)
    .some((l) => l.length > 1 && !NOT_BET.has(l) && BET_LABEL.test(l));
}

function words(text: string): string {
  return ` ${text.toLowerCase().normalize("NFC").replace(/[^a-z0-9à-ú]+/gi, " ")} `;
}

/** The deny words a text contains (whole words), empty when none. */
export function deniedWords(text: string): string[] {
  const w = words(text);
  return DENY_WORDS.filter((d) => w.includes(` ${d} `));
}

export type Verdict = "approve" | "review" | "reject";

export interface RuleResult {
  verdict: Verdict;
  category: "ok" | "gambling" | "malware" | "spam";
  reason: string | null;
}

/** The link's own rules: shorteners, files, gambling-looking domains. */
export function linkRules(url: string, host: string): RuleResult {
  const bare = host.replace(/^www\./, "");
  if (SHORTENERS.has(bare)) return { verdict: "reject", category: "spam", reason: "Use the project's own link, not a shortener or a chat link." };
  const path = new URL(url).pathname;
  if (FILE_EXT.test(path)) return { verdict: "reject", category: "malware", reason: "Link to the project's page, not to a file to download." };
  if (betHost(bare)) return { verdict: "reject", category: "gambling", reason: "Betting and casino sites can't be posted." };
  if (deniedWords(bare.replace(/[.-]/g, " ")).length) return { verdict: "reject", category: "gambling", reason: "Betting and casino sites can't be posted." };
  return { verdict: "approve", category: "ok", reason: null };
}

/** The words people wrote (and the page says): gambling and get-rich lines go to review, never straight live. */
export function textRules(text: string): RuleResult {
  const hit = deniedWords(text);
  if (hit.length) return { verdict: "review", category: "gambling", reason: `Mentions ${hit.slice(0, 3).join(", ")}` };
  return { verdict: "approve", category: "ok", reason: null };
}

/** The worst of a set of verdicts. */
export function worst(verdicts: Verdict[]): Verdict {
  return verdicts.includes("reject") ? "reject" : verdicts.includes("review") ? "review" : "approve";
}

// ─── People ─────────────────────────────────────────────────

/** Whether a dev's upvote moves the rank: an account 30 days old with some public contributions. */
export function countedVoter(dev: { account_created_at: string | null; contributions: number | null }, now = Date.now()): boolean {
  if (!dev.account_created_at) return false;
  const age = (now - Date.parse(dev.account_created_at)) / 86_400_000;
  return age >= COUNTED_MIN_DAYS && (dev.contributions ?? 0) > 0;
}

/** Whether a dev's account is old enough to post (the same bar as a counted vote, minus activity). */
export function canPostAccount(dev: { account_created_at: string | null }, now = Date.now()): boolean {
  if (!dev.account_created_at) return true;
  return (now - Date.parse(dev.account_created_at)) / 86_400_000 >= COUNTED_MIN_DAYS;
}

// ─── The ranking ────────────────────────────────────────────

/** A week's projects best first: most counted votes, then the one that went live first. */
export function rankWeek<T extends { votes: number; liveAt: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.votes - a.votes || (a.liveAt ?? Infinity) - (b.liveAt ?? Infinity));
}

/** The week's podium: the top 3 with at least one counted vote. */
export function podium<T extends { votes: number; liveAt: number | null }>(rows: T[]): T[] {
  return rankWeek(rows)
    .filter((r) => r.votes > 0)
    .slice(0, 3);
}

/** A url-safe slug from a project's name, with a suffix to keep it unique. */
export function projectSlug(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "project"}-${suffix}`;
}

/** Days and hours left in a week, for the card ("4d left", "6h left"). */
export function timeLeft(week: string, now = Date.now(), lang: Lang = "en"): string {
  const ms = Math.max(0, weekClosesAt(week) - now);
  const h = Math.floor(ms / 3_600_000);
  if (lang === "pt") return h >= 24 ? `faltam ${Math.floor(h / 24)}d` : h >= 1 ? `faltam ${h}h` : "fechando";
  return h >= 24 ? `${Math.floor(h / 24)}d left` : h >= 1 ? `${h}h left` : "closing";
}

/** The ad request form's budget answers (R$ for one week at #1). */
export const BUDGETS = ["0-50", "50-150", "150-500", "500-1500", "1500+"] as const;
export type Budget = (typeof BUDGETS)[number];
export const budgetLabel = (b: Budget): string => (b === "1500+" ? "R$ 1,500+" : `R$ ${b.split("-").map((n) => Number(n).toLocaleString("en-US")).join("–")}`);
export const ADVERTISER_KINDS = ["indie", "startup", "company", "agency"] as const;
export type AdvertiserKind = (typeof ADVERTISER_KINDS)[number];
export const advertiserLabel: Record<AdvertiserKind, string> = { indie: "Indie dev", startup: "Startup", company: "Company", agency: "Agency" };
