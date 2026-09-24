// ─── Editor shortcuts ───────────────────────────────────────
// Pure key → action mapping. Nothing fires while a text field has focus, so
// Backspace in the rename box or the invite field never deletes an object.

export type ShortcutAction =
  | { type: "slot"; slot: number }
  | { type: "rotate" }
  | { type: "remove" }
  | { type: "cancel" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "grid" }
  | { type: "camRotate"; dir: -1 | 1 }
  | { type: "pan"; dx: -1 | 0 | 1; dz: -1 | 0 | 1 }
  | { type: "preview" }
  | { type: "hand" };

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}

type TargetLike = { tagName?: string; isContentEditable?: boolean };

export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const t = target as TargetLike | null | undefined;
  if (!t) return false;
  const tag = (t.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!t.isContentEditable;
}

const PAN: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

export function keyToAction(e: KeyLike): ShortcutAction | null {
  if (isTypingTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  const mod = !!(e.ctrlKey || e.metaKey);

  if (mod) {
    if (key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (key === "y" && e.ctrlKey) return { type: "redo" };
    return null; // leave browser shortcuts (⌘R, ⌘S…) alone
  }
  if (e.altKey) return null;

  if (/^[1-9]$/.test(key)) return { type: "slot", slot: Number(key) - 1 };
  if (key === "r") return { type: "rotate" };
  if (key === "delete" || key === "backspace") return { type: "remove" };
  if (key === "escape") return { type: "cancel" };
  if (key === "g") return { type: "grid" };
  if (key === "q") return { type: "camRotate", dir: -1 };
  if (key === "e") return { type: "camRotate", dir: 1 };
  if (key === "p") return { type: "preview" };
  if (key === "h") return { type: "hand" };
  const pan = PAN[key];
  if (pan) return { type: "pan", dx: pan[0], dz: pan[1] };
  return null;
}
