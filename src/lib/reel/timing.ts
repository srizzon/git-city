// ─── How fast words type, how long they hold ────────────────
// Shared by the overlay that types them and the validator that checks they
// can be read: a plain module, so neither imports the other's world.

/** Characters a second a terminal line types (his Terminal piece: two frames a character at 30 fps). */
export const TYPE_CPS = 15;
/** A typed line is still on screen this long after its last character, so it can be read before the cut. */
export const READ_HOLD = 1;
