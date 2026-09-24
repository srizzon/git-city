// ─── Autosave queue ─────────────────────────────────────────
// Timing only: edits are batched 500 ms after the last change, one batch is
// in flight at a time, failures back off 2 s, 5 s, 10 s, then keep retrying
// every 10 s as "offline". What a batch is and how it's sent lives in
// `sendNext` (see useCityAutosave).

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error";

/** ok: sent (or rejected and handled). retry: network or rate limit. fatal: stop. */
export type SendOutcome = "ok" | "retry" | "fatal";

export interface SaveQueueDeps {
  hasWork(): boolean;
  sendNext(): Promise<SendOutcome>;
  onStatus(status: SaveStatus): void;
  debounceMs?: number;
  backoffMs?: number[];
}

export interface SaveQueue {
  /** Call after every change: (re)arms the debounce. */
  changed(): void;
  /** Sends now, skipping the debounce and any backoff wait. */
  flush(): void;
  status(): SaveStatus;
  /** Resolves once nothing is pending or in flight (or the queue stopped). */
  drained(): Promise<void>;
  dispose(): void;
}

export const DEBOUNCE_MS = 500;
export const BACKOFF_MS = [2_000, 5_000, 10_000];

export function createSaveQueue(deps: SaveQueueDeps): SaveQueue {
  const debounce = deps.debounceMs ?? DEBOUNCE_MS;
  const backoff = deps.backoffMs ?? BACKOFF_MS;
  let status: SaveStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let failures = 0;
  let stopped = false;
  let waiters: (() => void)[] = [];

  const setStatus = (s: SaveStatus) => {
    if (s === status) return;
    status = s;
    deps.onStatus(s);
  };
  const settle = () => {
    if (busy || (deps.hasWork() && !stopped)) return;
    const w = waiters;
    waiters = [];
    for (const f of w) f();
  };
  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, ms);
  };

  async function tick() {
    if (busy || stopped) return;
    if (!deps.hasWork()) {
      if (status === "saving" || status === "offline") setStatus("saved");
      settle();
      return;
    }
    busy = true;
    if (status !== "offline") setStatus("saving");
    let outcome: SendOutcome;
    try {
      outcome = await deps.sendNext();
    } catch {
      outcome = "retry";
    }
    busy = false;
    if (stopped) return settle();

    if (outcome === "fatal") {
      stopped = true;
      setStatus("error");
      return settle();
    }
    if (outcome === "retry") {
      failures++;
      if (failures >= backoff.length) setStatus("offline");
      arm(backoff[Math.min(failures, backoff.length) - 1]);
      return;
    }
    failures = 0;
    if (deps.hasWork()) arm(0);
    else {
      setStatus("saved");
      settle();
    }
  }

  return {
    changed() {
      if (stopped) return;
      // Don't cut short a backoff wait; a fresh edit rides the next retry.
      if (failures > 0 && timer) return;
      if (!busy) arm(debounce);
    },
    flush() {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = null;
      void tick();
    },
    status: () => status,
    drained() {
      if (!busy && (!deps.hasWork() || stopped)) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
    dispose() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      settle();
    },
  };
}
