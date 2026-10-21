// ─── Language ────────────────────────────────────────────────
// The Brasil map speaks Portuguese or English; the rest of Git City is
// English. The visitor's pick (the PT/EN switch) wins, then a Portuguese
// browser, then a visit from Brazil (many Brazilian devs run their OS in
// English). Pure, safe on the server.

export type Lang = "en" | "pt";

/** The cookie the PT/EN switch writes. */
export const LANG_COOKIE = "gc_lang";

export function pickLang({ cookie, acceptLanguage, country }: { cookie?: string | null; acceptLanguage?: string | null; country?: string | null }): Lang {
  if (cookie === "pt" || cookie === "en") return cookie;
  const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("pt")) return "pt";
  return country?.toUpperCase() === "BR" ? "pt" : "en";
}
