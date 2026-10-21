"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowBigDown, Bomb, ChevronsDown, Megaphone, Rocket, Wind, Zap, type LucideIcon } from "lucide-react";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { ITEM_NAMES, ITEM_NAMES_PT, isItem, type BattleItem } from "@/lib/league-city/drive/battle";
import { useLang } from "@/lib/i18n/LangProvider";
import { autoDrift, dragSteer, type TouchDrive } from "@/lib/league-city/drive/touch";
import { ReactionButton } from "./Reactions";

// Phone controls (lib drive/touch), laid out for a phone held upright, on one
// grid so everything lines up:
//   anywhere   touch starts the car; drag left and right to steer (a ring
//              marks where the finger went down, a dot how far it went);
//              steering hard at speed drifts by itself
//   one row    along the bottom: BRAKE (hold, big), which says REVERSE once
//              the car has stopped since that's what it does then, DRIFT
//              (hold while steering), the speed, REACT (the six reactions,
//              when the HUD hands `onEmote`), HORN, which lights up with the
//              teammate's name when you're parked at their building (honking
//              opens it), and BOOST (hold, big)
//   attack     over the speed, only while you hold one
// The button a prompt is teaching pulses (`lesson`). Everything sits under the
// other HUD pieces, so their buttons still take taps.
// `mode="drift"` (the drift spots): no auto drift (a held DRIFT only, like
// Mario Kart 8's time trials without smart steering), no boost, horn or
// attack; BRAKE and DRIFT are the two big buttons, the speed between them.

const ITEM_ICON: Record<BattleItem, LucideIcon> = { shock: Zap, bomb: Bomb, missile: Rocket };
/** Attacks: the ? boxes' orange. */
export const ATTACK = "#ff9a3c";
/** A tap on the attack or the horn holds its input this long, so the car sees it (ms). */
const TAP_MS = 150;
/** Under this (m/s, forward) the brake button reverses. */
const REVERSE_BELOW = 0.5;

const BASE =
  "pointer-events-auto relative flex touch-none select-none items-center justify-center border-[3px] bg-bg/80 backdrop-blur-sm [-webkit-touch-callout:none] transition-colors";
/** The drift spots' two buttons. */
const BIG = `${BASE} h-20 w-20 flex-col gap-1 text-[10px]`;
/** The town's one row, two ranks: brake and boost you hold all the time, the rest now and then. */
const ROW_BIG = `${BASE} h-16 w-16 shrink-0 flex-col gap-1 text-[9px]`;
const ROW_SMALL = `${BASE} h-12 w-12 shrink-0 flex-col gap-0.5 text-[7px]`;
/** The attack: icon and name on one line. */
const CHIP = `${BASE} h-14 gap-2 px-3 text-[10px] whitespace-nowrap`;
/** The button a prompt teaches: a ring pulses around it, the button stays as it is. */
function Pulse({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="pointer-events-none absolute -inset-[7px] animate-ping border-[3px] border-lime" aria-hidden />;
}

export type TouchLesson = "boost" | "drift" | "attack" | null;

export default function TouchControls({
  touchRef,
  telemetry,
  lesson = null,
  mode = "town",
  onEmote,
  onChat,
}: {
  touchRef: React.MutableRefObject<TouchDrive>;
  telemetry: DriveTelemetry;
  /** The button a prompt is teaching right now. */
  lesson?: TouchLesson;
  mode?: "town" | "drift";
  /** Your reactions: a React button in the row. */
  onEmote?: (e: number) => void;
  /** Signed in: the reactions menu's Chat opens the field. */
  onChat?: () => void;
}) {
  const driftMode = mode === "drift";
  const drag = useRef<{ id: number; origin: number; x: number; y: number } | null>(null);
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const { lang, t } = useLang();
  const names = lang === "pt" ? ITEM_NAMES_PT : ITEM_NAMES;
  const [brake, setBrake] = useState(false);
  const [drift, setDrift] = useState(false);
  const [boost, setBoost] = useState(false);
  const [reverse, setReverse] = useState(true);
  const [item, setItem] = useState<BattleItem | null>(null);
  const [near, setNear] = useState<string | null>(null);

  // On while mounted; a clean slate either way.
  useEffect(() => {
    const t = touchRef.current;
    const idle = { started: false, steer: 0, brake: false, boost: false, drift: false, driftButton: false, fire: false, horn: false };
    Object.assign(t, idle, { on: true });
    return () => {
      Object.assign(t, idle, { on: false });
    };
  }, [touchRef]);

  // Every frame: auto drift, the speed readout, and what the buttons offer.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let held = 0;
    let shownItem: BattleItem | null = null;
    let shownNear: string | null = null;
    let shownReverse = true;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = touchRef.current;
      if (!driftMode) {
        const d = autoDrift(t.drift, held, drag.current ? t.steer : 0, telemetry.speed, dt);
        t.drift = d.drift;
        held = d.held;
      }
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(telemetry.speed) * 3.6));
      const rev = telemetry.speed < REVERSE_BELOW;
      if (rev !== shownReverse) {
        shownReverse = rev;
        setReverse(rev);
      }
      const it = isItem(telemetry.held) ? telemetry.held : null;
      if (it !== shownItem) {
        shownItem = it;
        setItem(it);
      }
      if (telemetry.near !== shownNear) {
        shownNear = telemetry.near;
        setNear(shownNear);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [touchRef, telemetry, driftMode]);

  const showDrag = () => {
    const d = drag.current;
    if (!ring.current || !dot.current) return;
    ring.current.style.opacity = d ? "1" : "0";
    dot.current.style.opacity = d ? "1" : "0";
    if (!d) return;
    ring.current.style.transform = `translate(${d.origin}px, ${d.y}px)`;
    dot.current.style.transform = `translate(${d.x}px, ${d.y}px)`;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, origin: e.clientX, x: e.clientX, y: e.clientY };
    // A mouse (a phone-wide window on a computer) drives with the keys: no auto throttle.
    if (e.pointerType !== "mouse") touchRef.current.started = true;
    showDrag();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const s = dragSteer(d.origin, e.clientX, window.innerWidth);
    d.origin = s.origin;
    d.x = e.clientX;
    touchRef.current.steer = s.steer;
    showDrag();
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    touchRef.current.steer = 0;
    touchRef.current.drift = false;
    showDrag();
  };

  /** Hold-to-use buttons: on while the finger is on them. */
  const hold = (key: "brake" | "boost" | "driftButton", set: (v: boolean) => void) => {
    const off = () => {
      touchRef.current[key] = false;
      set(false);
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        touchRef.current[key] = true;
        // Any button counts as a first touch too.
        if (e.pointerType !== "mouse") touchRef.current.started = true;
        set(true);
      },
      onPointerUp: off,
      onPointerCancel: off,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  };
  const tap = (key: "fire" | "horn") => () => {
    touchRef.current[key] = true;
    window.setTimeout(() => (touchRef.current[key] = false), TAP_MS);
  };

  const Icon = item ? ITEM_ICON[item] : null;

  return (
    <>
      {/* Steering: the whole screen, under everything else. */}
      <div
        className="pointer-events-auto absolute inset-0 touch-none select-none [-webkit-touch-callout:none]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden
      />
      <div
        ref={ring}
        className="pointer-events-none absolute left-0 top-0 -ml-7 -mt-7 h-14 w-14 rounded-full border-[3px] border-cream/40 opacity-0 transition-opacity"
        aria-hidden
      />
      <div
        ref={dot}
        className="pointer-events-none absolute left-0 top-0 -ml-4 -mt-4 h-8 w-8 rounded-full bg-cream/60 opacity-0 transition-opacity"
        aria-hidden
      />

      {driftMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto grid max-w-md grid-cols-[5rem_minmax(0,1fr)_5rem] items-center gap-x-3">
            <button
              type="button"
              aria-label={t("Brake, hold", "Freio, segure")}
              {...hold("brake", setBrake)}
              className={`${BIG} ${brake ? "border-cream bg-cream text-bg" : "border-cream/70 text-cream"}`}
            >
              <ChevronsDown size={24} strokeWidth={2.5} aria-hidden />
              {t("Brake", "Freio")}
            </button>
            <div className="flex items-baseline justify-center gap-1 tabular-nums [text-shadow:2px_2px_0_rgba(0,0,0,0.6)]">
              <span ref={speed} className="text-2xl leading-none text-cream">
                0
              </span>
              <span className="text-[9px] text-cream/70">km/h</span>
            </div>
            <button
              type="button"
              aria-label={t("Drift, hold while steering", "Drift, segure enquanto vira")}
              {...hold("driftButton", setDrift)}
              className={`${BIG} ${drift ? "border-lime bg-lime text-bg" : "border-lime text-lime"}`}
            >
              <Pulse on={lesson === "drift"} />
              <Wind size={24} strokeWidth={2.5} aria-hidden />
              Drift
            </button>
          </div>
        </div>
      )}
      {!driftMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="relative mx-auto flex max-w-md items-end justify-between gap-1.5">
            <button
              type="button"
              aria-label={reverse ? t("Reverse, hold", "Ré, segure") : t("Brake, hold", "Freio, segure")}
              {...hold("brake", setBrake)}
              className={`${ROW_BIG} ${brake ? "border-cream bg-cream text-bg" : "border-cream/70 text-cream"}`}
            >
              {reverse ? <ArrowBigDown size={22} strokeWidth={2.5} aria-hidden /> : <ChevronsDown size={22} strokeWidth={2.5} aria-hidden />}
              {reverse ? t("Reverse", "Ré") : t("Brake", "Freio")}
            </button>
            <button
              type="button"
              aria-label={t("Drift, hold while steering", "Drift, segure enquanto vira")}
              {...hold("driftButton", setDrift)}
              className={`${ROW_SMALL} ${drift ? "border-lime bg-lime text-bg" : "border-lime/80 text-lime"}`}
            >
              <Pulse on={lesson === "drift"} />
              <Wind size={16} strokeWidth={2.5} aria-hidden />
              Drift
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center self-center tabular-nums [text-shadow:2px_2px_0_rgba(0,0,0,0.6)]">
              <span ref={speed} className="text-xl leading-none text-cream">
                0
              </span>
              <span className="text-[8px] text-cream/70">km/h</span>
            </div>
            {onEmote && <ReactionButton onEmote={onEmote} onChat={onChat} up className={`${ROW_SMALL} border-cream/40 text-cream/80`} />}
            <div className="relative shrink-0">
              {/* Parked at a teammate's building: whose, over the horn that opens it. */}
              {near && (
                <span className="pointer-events-none absolute bottom-full right-0 mb-2 max-w-[9rem] truncate border-2 border-lime bg-bg px-1.5 py-0.5 text-[9px] text-lime">
                  @{near}
                </span>
              )}
              <button
                type="button"
                onClick={tap("horn")}
                aria-label={near ? t(`Honk at @${near}`, `Buzinar pra @${near}`) : t("Horn", "Buzina")}
                className={`${ROW_SMALL} ${near ? "border-lime text-lime" : "border-cream/40 text-cream/80"} active:bg-cream active:text-bg`}
              >
                <Megaphone size={16} strokeWidth={2.5} aria-hidden />
                {t("Horn", "Buzina")}
              </button>
            </div>
            <button
              type="button"
              aria-label={t("Boost, hold", "Turbo, segure")}
              {...hold("boost", setBoost)}
              className={`${ROW_BIG} ${boost ? "border-[#7ee8ff] bg-[#7ee8ff] text-bg" : "border-[#7ee8ff] text-[#7ee8ff]"}`}
            >
              <Pulse on={lesson === "boost"} />
              <Zap size={22} strokeWidth={2.5} aria-hidden />
              {t("Boost", "Turbo")}
            </button>
            {item && Icon && (
              <div className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2">
                <button
                  type="button"
                  onClick={tap("fire")}
                  aria-label={t(`Throw the ${ITEM_NAMES[item].toLowerCase()}`, `Jogar ${names[item].toLowerCase()}`)}
                  className={`${CHIP} text-cream active:bg-[#ff9a3c] active:text-bg`}
                  style={{ borderColor: ATTACK }}
                >
                  <Pulse on={lesson === "attack"} />
                  <Icon size={18} strokeWidth={2.5} color={ATTACK} className="shrink-0" aria-hidden />
                  {names[item]}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
