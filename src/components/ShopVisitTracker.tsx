"use client";

import { useEffect, useRef } from "react";
import { reportShopVisit } from "@/lib/shop-visit";

// Mounted on /shop for a signed-in player with a claimed building only. Runs in
// an effect, so it fires once the page really mounts in the browser, never on a
// server render or a link prefetch.
export default function ShopVisitTracker() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void reportShopVisit();
  }, []);
  return null;
}
