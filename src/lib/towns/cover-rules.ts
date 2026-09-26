// ─── Town covers (pure) ─────────────────────────────────────
// When the town page should photograph its city for the Discover card.

/** The automatic cover is retaken at most this often, and only if the city changed. */
export const COVER_EVERY_MS = 24 * 60 * 60 * 1000;
/** The saved picture: 16:10, sharp enough for a card at 2x. */
export const COVER_W = 960;
export const COVER_H = 600;
/** Uploads above this are refused before decoding. */
export const COVER_MAX_BYTES = 1_500_000;

export interface CoverState {
  path: string | null;
  version: number | null;
  pinned: boolean;
  at: string | null;
}

/** An automatic cover is due: none yet, or the city changed since and the last one is a day old. Never over a pinned one. */
export function coverDue(cover: CoverState, cityVersion: number, now: Date): boolean {
  if (cover.pinned) return false;
  if (!cover.path || !cover.at) return true;
  if (cover.version === cityVersion) return false;
  return now.getTime() - new Date(cover.at).getTime() >= COVER_EVERY_MS;
}
