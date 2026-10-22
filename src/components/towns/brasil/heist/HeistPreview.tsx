"use client";

import { useState } from "react";
import { KIT, type HeistResult, type HeistSide, type HeistView, type KitSlot } from "@/lib/towns/heist";

// Local only: /town/brasil-town?heist=1 puts made-up city-of-the-day states on
// the real page (map and drive HUD), switched from a strip on the left, to
// judge the screens among everything else the page shows. Nothing is sent
// anywhere. Off in production.

export const HEIST_STEPS = ["card", "card-picked", "card-resident", "result", "pick", "robber", "push", "paused", "pushed", "busted", "bluescreen", "cop", "off"] as const;
export type HeistStep = (typeof HEIST_STEPS)[number];
/** The steps that happen in the car (the strip starts a drive for them). */
export const IN_CAR: readonly HeistStep[] = ["pick", "robber", "push", "paused", "pushed", "busted", "bluescreen", "cop"];

const CITY = { name: "Campinas", uf: "SP", buildings: 214, standing: 0.62 };

function kit(side: HeistSide, charging: number): KitSlot[] {
  return KIT[side].map((item, i) => ({ item, key: String(i + 1) as KitSlot["key"], charging: i === 1 ? charging : 0, secs: i === 1 ? 11 : 0 }));
}

export function heistMock(step: HeistStep): { view: HeistView | null; result: HeistResult | null } {
  const robber = (over: Partial<NonNullable<HeistView["robber"]>> = {}): HeistView => ({
    city: CITY,
    side: "robber",
    resident: false,
    robber: { unpushed: 30, stars: 3, hearts: 4, push: null, ...over },
    cop: null,
    kit: kit("robber", 0.55),
    flash: null,
  });
  switch (step) {
    case "card":
      return { view: { city: CITY, side: null, resident: false, robber: null, cop: null, kit: null, flash: null }, result: null };
    case "card-picked":
      return { view: { city: CITY, side: "robber", resident: false, robber: null, cop: null, kit: null, flash: null }, result: null };
    case "card-resident":
      return { view: { city: CITY, side: "cop", resident: true, robber: null, cop: null, kit: null, flash: null }, result: null };
    case "pick":
      return { view: { city: CITY, side: null, resident: false, robber: null, cop: null, kit: null, flash: null }, result: null };
    case "robber":
      return { view: robber(), result: null };
    case "push":
      return { view: robber({ push: { secsLeft: 2, done: 0.6, paused: false } }), result: null };
    case "paused":
      return { view: robber({ stars: 4, hearts: 3, push: { secsLeft: 2, done: 0.6, paused: true } }), result: null };
    case "pushed":
      return { view: { ...robber({ unpushed: 0, stars: 0, hearts: 5 }), flash: { kind: "pushed", pts: 30 } }, result: null };
    case "busted":
      return { view: { ...robber({ unpushed: 0, stars: 0, hearts: 0 }), flash: { kind: "busted", pts: 30, by: "marina_dev" } }, result: null };
    case "bluescreen":
      return { view: { ...robber(), flash: { kind: "bluescreen", by: "marina_dev" } }, result: null };
    case "cop":
      return { view: { city: CITY, side: "cop", resident: false, robber: null, cop: { busts: 2, target: "joaopedro" }, kit: kit("cop", 0.7), flash: null }, result: null };
    case "result":
      return {
        view: null,
        result: {
          city: CITY,
          standing: 0.74,
          cops: [
            { login: "marina_dev", busts: 6 },
            { login: "caio.ts", busts: 4 },
          ],
          robbers: [{ login: "joaopedro", pts: 140 }],
          you: { side: "cop", busts: 2, bonus: 30 },
        },
      };
    default:
      return { view: null, result: null };
  }
}

/** The step from ?heist=, or null when the preview is off. */
export function useHeistPreview(): [HeistStep | null, (s: HeistStep) => void] {
  const [step, setStep] = useState<HeistStep | null>(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search).get("heist");
    if (q === null) return null;
    return (HEIST_STEPS as readonly string[]).includes(q) ? (q as HeistStep) : "card";
  });
  return [step, setStep];
}

export function HeistPreviewStrip({ step, onStep }: { step: HeistStep; onStep: (s: HeistStep) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto fixed left-2 top-1/2 z-[90] flex -translate-y-1/2 flex-col gap-px font-pixel text-[9px] uppercase">
      <button type="button" onClick={() => setOpen((o) => !o)} className="bg-red-500 px-2 py-1 text-left text-bg">
        Preview · {step} {open ? "▴" : "▾"}
      </button>
      {open &&
        HEIST_STEPS.map((s) => (
          <button key={s} type="button" onClick={() => onStep(s)} className={`px-2 py-1 text-left ${s === step ? "bg-lime text-bg" : "bg-[#141417]/90 text-cream hover:text-lime"}`}>
            {s}
          </button>
        ))}
    </div>
  );
}
