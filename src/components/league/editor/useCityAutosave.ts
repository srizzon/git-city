"use client";

import { useEffect, useRef, useState } from "react";
import { createSaveQueue, type SaveQueue, type SaveStatus, type SendOutcome } from "@/lib/league-city/editor/queue";
import type { EditorStore } from "@/lib/league-city/editor/store";
import type { CitySnapshot } from "@/lib/league-city/editor/state";

// Drives the autosave queue for the editor store: posts batches to
// /city/ops, acks or rolls back, resyncs when the server moved on without us,
// flushes on pagehide and warns before leaving with unsaved edits.

export interface Autosave {
  status: SaveStatus;
  /** Sends everything now and resolves when nothing is left. */
  drain(): Promise<void>;
}

async function loadCity(slug: string): Promise<CitySnapshot | null> {
  try {
    const res = await fetch(`/api/leagues/${slug}/city`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as CitySnapshot) : null;
  } catch {
    return null;
  }
}

export function useCityAutosave(
  slug: string,
  store: EditorStore,
  { enabled, onForbidden }: { enabled: boolean; onForbidden: () => void },
): Autosave {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const queueRef = useRef<SaveQueue | null>(null);
  const forbiddenRef = useRef(onForbidden);
  useEffect(() => {
    forbiddenRef.current = onForbidden;
  }, [onForbidden]);

  useEffect(() => {
    if (!enabled) return;
    const url = `/api/leagues/${slug}/city/ops`;

    const resync = async () => {
      const city = await loadCity(slug);
      if (city) store.dispatch({ type: "resync", city });
    };

    const sendNext = async (): Promise<SendOutcome> => {
      if (!store.getState().inflight) store.dispatch({ type: "send" });
      const s = store.getState();
      const batch = s.inflight;
      if (!batch) return "ok";
      const base = s.version;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: batch.flatMap((e) => e.ops) }),
          keepalive: true, // survives a reload mid-save
        });
      } catch {
        return "retry";
      }
      if (res.ok) {
        const json = (await res.json()) as { version: number; size: number };
        store.dispatch({ type: "ack", version: json.version });
        // Someone else (an invite, another tab) moved the city: catch up.
        if (json.version !== base + 1 || json.size !== s.size) await resync();
        return "ok";
      }
      if (res.status === 429 || res.status >= 500) return "retry";
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.status === 403 || res.status === 401) {
        store.dispatch({ type: "reject" });
        forbiddenRef.current();
        return "fatal";
      }
      if (json.code === "not_found") {
        store.dispatch({ type: "reject", message: "Someone else changed the city. Here's the latest." });
        await resync();
        return "ok";
      }
      store.dispatch({ type: "reject", message: json.error ?? "Couldn't save that change." });
      return "ok";
    };

    const queue = createSaveQueue({
      hasWork: () => {
        const s = store.getState();
        return s.pending.length > 0 || !!s.inflight;
      },
      sendNext,
      onStatus: setStatus,
    });
    queueRef.current = queue;

    let lastPending = store.getState().pending;
    const unsubscribe = store.subscribe(() => {
      const p = store.getState().pending;
      if (p !== lastPending && p.length > 0) queue.changed();
      lastPending = p;
    });

    // Leaving: send what's queued with keepalive, and warn if it can't finish.
    const flushOnLeave = () => {
      const s = store.getState();
      if (s.pending.length === 0) return;
      store.dispatch({ type: "send", maxOps: 200 });
      const batch = store.getState().inflight;
      if (!batch || s.inflight) return queue.flush();
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: batch.flatMap((e) => e.ops) }),
        keepalive: true,
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") queue.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = store.getState();
      if (s.pending.length === 0 && !s.inflight) return;
      e.preventDefault();
    };
    // Back from the bfcache after a keepalive flush: the server may already
    // have that batch, so drop the local copy and take the server's city.
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !store.getState().inflight) return;
      store.dispatch({ type: "reject" });
      void resync();
    };
    window.addEventListener("pagehide", flushOnLeave);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flushOnLeave);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      queue.dispose();
      queueRef.current = null;
    };
  }, [enabled, slug, store]);

  return {
    status,
    drain: async () => {
      const q = queueRef.current;
      if (!q) return;
      q.flush();
      await q.drained();
    },
  };
}
