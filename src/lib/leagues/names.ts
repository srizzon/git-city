import { checkProfanity, type Language } from "glin-profanity";
import { LeagueError } from "./service";

const LANGUAGES: Language[] = ["english", "portuguese", "spanish"];

/** Trimmed, single-spaced league name. Throws LeagueError when invalid. */
export function cleanLeagueName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) {
    throw new LeagueError("invalid_name", "League name must be 2 to 40 characters.");
  }
  if (checkProfanity(name, { languages: LANGUAGES, detectLeetspeak: true }).containsProfanity) {
    throw new LeagueError("invalid_name", "Pick a different name.");
  }
  return name;
}
