"use client";

import { useState, useEffect } from "react";
import LofiRadio from "./LofiRadio";

export default function GlobalRadio() {
  const [mounted, setMounted] = useState(false);
  const [pageHandlesRadio, setPageHandlesRadio] = useState(false);

  // Delay activation past React's selective hydration window.
  // The layout hydrates (and fires effects) before Suspense-wrapped
  // page content, so a plain useEffect can portal into gc-radio-slot
  // while the page is still hydrating — causing a mismatch.
  // Double rAF guarantees we're past all hydration passes.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const check = () => !!document.getElementById("gc-radio-slot");
    setPageHandlesRadio(check());

    const observer = new MutationObserver(() => setPageHandlesRadio(check()));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mounted]);

  if (!mounted || pageHandlesRadio) return null;

  // Fallback for pages that don't render their own LofiRadio
  return (
    <div className="pointer-events-auto fixed bottom-4 left-3 z-[25] sm:left-4">
      <LofiRadio />
    </div>
  );
}
