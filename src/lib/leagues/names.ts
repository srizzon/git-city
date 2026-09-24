import { checkProfanity, type Language } from "glin-profanity";
import { LeagueError } from "./errors";

const LANGUAGES: Language[] = ["english", "portuguese", "spanish"];

/** A GitHub login (users and orgs). */
export const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;

// Zero-width, bidi override and isolate characters: invisible, and they let a
// name look like another one (or flip the text around it).
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Trimmed, single-spaced league name. Throws LeagueError when invalid. */
export function cleanLeagueName(raw: string): string {
  const name = raw.normalize("NFKC").replace(INVISIBLE_RE, "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) {
    throw new LeagueError("invalid_name", "League name must be 2 to 40 characters.");
  }
  if (checkProfanity(name, { languages: LANGUAGES, detectLeetspeak: true }).containsProfanity) {
    throw new LeagueError("invalid_name", "Pick a different name.");
  }
  return name;
}

/** A company league's name: the org's display name when it passes, else its login. */
export function companyLeagueName(displayName: string | null | undefined, login: string): string {
  if (displayName) {
    try {
      return cleanLeagueName(displayName);
    } catch {
      // rejected: fall back to the login
    }
  }
  return login;
}

// Paths a league slug must never take, so /league/<slug> can't pose as an app page.
const RESERVED_SLUGS = new Set(["verify", "api", "new", "create", "settings", "admin"]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
