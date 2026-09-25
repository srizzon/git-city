// ─── Company tab of /towns/new (pure) ───────────────────────
// What the server found out about one org for the viewer, and the one screen
// that follows from it. Checking is read-only: only the final button of the
// screen creates or joins a town.

/** GitHub logins are 1–39 chars, letters, digits and inner hyphens. */
const LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;

/**
 * The org a person typed or pasted: `zard-ui`, `@zard-ui`, a github.com URL
 * (org page, a repo, the people page). Null when it can't be a login.
 */
export function normalizeOrgInput(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s.startsWith("github.com/")) {
    s = s.slice("github.com/".length);
    // github.com/orgs/<org>/people
    if (s.startsWith("orgs/")) s = s.slice("orgs/".length);
    s = s.split(/[/?#]/)[0] ?? "";
  }
  s = s.replace(/^@/, "");
  return LOGIN.test(s) ? s : null;
}

export type OrgAccount = "org" | "user" | "none" | "error";

/** The viewer's standing in the org's town. */
export type TownStanding = "member" | "invited" | "removed" | "none";

export interface OrgCheck {
  /** Lowercase login as checked. */
  org: string;
  /** What `org` is on GitHub; "error" when GitHub didn't answer. */
  account: OrgAccount;
  /** The town's name as shown: the existing town's, or the one it would get. */
  townLabel: string;
  avatarUrl: string | null;
  /**
   * How the viewer's membership is proven: "private" from the read:org
   * sign-in (developer_orgs), "public" from the org's public member list,
   * null when neither shows it.
   */
  proof: "private" | "public" | null;
  /** The org's company town, if it has one. */
  town: { slug: string; name: string; buildings: number } | null;
  standing: TownStanding;
  /** Another company town the viewer lives in (one per dev). */
  otherTown: { slug: string; name: string } | null;
  /**
   * With no town yet: public members other than the viewer, who come in as
   * dark buildings (capped at SEED_CAP). Null when unknown.
   */
  colleagues: number | null;
}

/** The most public members a new company town starts with. */
export const SEED_CAP = 100;

export type CompanyStep =
  | { kind: "none" } // no org picked yet
  | { kind: "no_account" }
  | { kind: "person" }
  | { kind: "github_down" }
  | { kind: "not_member" }
  | { kind: "removed" }
  | { kind: "open"; slug: string }
  | { kind: "move_in"; invited: boolean; leaving: string | null }
  | { kind: "build"; leaving: string | null };

export function companyStep(check: OrgCheck | null): CompanyStep {
  if (!check) return { kind: "none" };
  if (check.account === "error") return { kind: "github_down" };
  if (check.account === "none") return { kind: "no_account" };
  if (check.account === "user") return { kind: "person" };
  // A member stays a member even if their proof lapsed today: the daily
  // check decides that, the page just opens.
  if (check.town && check.standing === "member") return { kind: "open", slug: check.town.slug };
  if (check.town && check.standing === "removed") return { kind: "removed" };
  if (!check.proof) return { kind: "not_member" };
  const leaving = check.otherTown && check.otherTown.slug !== check.town?.slug ? check.otherTown.name : null;
  if (check.town) return { kind: "move_in", invited: check.standing === "invited", leaving };
  return { kind: "build", leaving };
}

/** "12 colleagues", "1 colleague", "100+ colleagues". */
export function colleaguesLabel(n: number): string {
  if (n >= SEED_CAP) return `${SEED_CAP}+ colleagues`;
  return n === 1 ? "1 colleague" : `${n} colleagues`;
}
