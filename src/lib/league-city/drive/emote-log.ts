import { LOG_LINES } from "./emotes";

// The room's last reactions for the HUD's log. A tiny external store, so a
// reaction re-renders the log only, never the town page (which hitched the
// car and camera).

export interface EmoteLogEntry {
  key: number;
  name: string;
  e: number;
  /** A typed message instead of the reaction slot. */
  text?: string;
  mine: boolean;
}

export interface EmoteLog {
  push: (entry: EmoteLogEntry) => void;
  clear: () => void;
  get: () => EmoteLogEntry[];
  subscribe: (fn: () => void) => () => void;
}

export function createEmoteLog(): EmoteLog {
  let list: EmoteLogEntry[] = [];
  const subs = new Set<() => void>();
  const set = (next: EmoteLogEntry[]) => {
    list = next;
    for (const fn of subs) fn();
  };
  return {
    push: (entry) => set([...list, entry].slice(-LOG_LINES)),
    clear: () => set([]),
    get: () => list,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
