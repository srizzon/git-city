"use client";

import { useEffect, useRef } from "react";
import { VISIT_SECONDS } from "@/lib/towns/visits";

function post(slug: string, drove: boolean) {
  fetch(`/api/towns/${encodeURIComponent(slug)}/visit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drove }),
  }).catch(() => {});
}

/**
 * Reports a qualified visit: after 30 s with the tab visible, and on the first
 * drive. Each fires at most once per page load; the server keeps one row per
 * day. `eligible` is false for signed-out viewers and members.
 */
export function useTownVisit(slug: string, eligible: boolean, driving: boolean) {
  const timed = useRef(false);
  const drove = useRef(false);

  useEffect(() => {
    if (!eligible || timed.current) return;
    let seen = 0;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      seen += 1;
      if (seen < VISIT_SECONDS || timed.current) return;
      timed.current = true;
      window.clearInterval(id);
      if (!drove.current) post(slug, false);
    }, 1000);
    return () => window.clearInterval(id);
  }, [slug, eligible]);

  useEffect(() => {
    if (!eligible || !driving || drove.current) return;
    drove.current = true;
    post(slug, true);
  }, [slug, eligible, driving]);
}
