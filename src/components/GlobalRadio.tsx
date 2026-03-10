"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import LofiRadio from "./LofiRadio";

export default function GlobalRadio() {
  const [mounted, setMounted] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);

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

    const readSlotId = () => {
      const next = (window as unknown as { __gcRadioSlotId?: unknown }).__gcRadioSlotId;
      setSlotId(typeof next === "string" ? next : null);
    };

    readSlotId();

    const handleSlotChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      setSlotId(typeof detail === "string" ? detail : null);
    };

    window.addEventListener("gc:radio-slot", handleSlotChange);
    return () => window.removeEventListener("gc:radio-slot", handleSlotChange);
  }, [mounted]);

  if (!mounted) return null;

  const slot = slotId ? document.getElementById(slotId) : null;

  // When the main page provides a slot, portal into it (inline with theme/intro buttons)
  if (slot) return createPortal(<LofiRadio />, slot);

  // Fallback for other pages: fixed bottom-left
  return (
    <div className="pointer-events-auto fixed bottom-4 left-3 z-[25] sm:left-4">
      <LofiRadio />
    </div>
  );
}
