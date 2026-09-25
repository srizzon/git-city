// How a newcomer gets into a custom town (leagues.join_mode, migration 143).
// Company towns ignore it: they're joined by verifying GitHub org membership.

export type JoinMode = "open" | "request" | "invite";
export const JOIN_MODES: readonly JoinMode[] = ["open", "request", "invite"];

export function isJoinMode(v: unknown): v is JoinMode {
  return typeof v === "string" && (JOIN_MODES as readonly string[]).includes(v);
}

/** A request (answered or not) blocks a new one for this long, and expires after it. */
export const REQUEST_TTL_DAYS = 14;
/** Live requests a dev may have open across all towns. */
export const MAX_PENDING_REQUESTS = 5;

export interface JoinRequestRow {
  status: "pending" | "approved" | "declined" | "cancelled";
  created_at: string;
}

/**
 * The requester's view of a request: a decline looks exactly like a request
 * nobody answered, and both end after 14 days.
 */
export function requestIsLive(r: JoinRequestRow | null | undefined, now = new Date()): boolean {
  if (!r || (r.status !== "pending" && r.status !== "declined")) return false;
  return now.getTime() - new Date(r.created_at).getTime() < REQUEST_TTL_DAYS * 86_400_000;
}

/** What the town page offers a viewer who isn't in the town yet. */
export type JoinAction =
  | "member" // already in
  | "join" // one click: invited, holding the admin's link, or an open town
  | "ask" // request mode: ask the admin
  | "pending" // asked; waiting (or quietly declined)
  | "verify" // company town: prove org membership
  | "none"; // invite only, or removed by the admin

export function joinAction(v: {
  kind: "company" | "custom";
  mode: JoinMode;
  membership: { status: "invited" | "active" | "former"; removed_by: number | null } | null;
  tokenOk: boolean;
  request: JoinRequestRow | null;
  now?: Date;
}): JoinAction {
  const m = v.membership;
  if (m?.status === "active") return "member";
  if (v.kind === "company") return "verify";
  if (m?.status === "invited" || v.tokenOk) return "join";
  if (m?.status === "former" && m.removed_by !== null) return "none";
  if (v.mode === "open") return "join";
  if (v.mode === "request") return requestIsLive(v.request, v.now) ? "pending" : "ask";
  return "none";
}
