import { randomBytes, timingSafeEqual } from "node:crypto";

// ─── Invite tokens ──────────────────────────────────────────
// A custom league's open invite link carries `t=<leagues.invite_token>`.
// Joining without an `invited` row needs it; the admin can rotate it.

export function newInviteToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Constant-time check. A league without a token accepts none. */
export function tokenMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type JoinDecision = "active" | "invited" | "token" | "needs_invite" | "removed";

/**
 * Who may join a custom league: invited members always; newcomers and members
 * who left, with the league's token; members an admin removed, only after a
 * new invite.
 */
export function customJoinDecision(
  membership: { status: "invited" | "active" | "former"; removed_by: number | null } | null,
  tokenOk: boolean,
): JoinDecision {
  if (membership?.status === "active") return "active";
  if (membership?.status === "invited") return "invited";
  if (membership?.status === "former" && membership.removed_by !== null) return "removed";
  return tokenOk ? "token" : "needs_invite";
}
