"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Smile } from "lucide-react";
import { EMOTES, emoteForKey } from "@/lib/league-city/drive/emotes";
import { HUD_BOX } from "../shared";
import { carColor } from "@/lib/league-city/drive/net";
import type { EmoteLog } from "@/lib/league-city/drive/emote-log";

// Quick reactions in the HUD (lib drive/emotes). On a keyboard: the six slots
// in a row with their keys, 1–6 fires one and its slot flashes. On a phone:
// a smile button that opens the six, a tap sends and closes it. Over the
// row on a keyboard, a small log of the room's last reactions.

function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

/** Keys 1–6 while driving. */
function useEmoteKeys(on: boolean, onEmote: (e: number) => void) {
  const [flash, setFlash] = useState<{ e: number; at: number } | null>(null);
  const cb = useRef(onEmote);
  useEffect(() => {
    cb.current = onEmote;
  });
  useEffect(() => {
    if (!on) return;
    const down = (ev: KeyboardEvent) => {
      if (ev.repeat || typing() || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const e = emoteForKey(ev.code);
      if (e === null) return;
      ev.preventDefault();
      cb.current(e);
      setFlash({ e, at: performance.now() });
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [on]);
  return flash;
}

/** Keyboard: the row of slots. */
export function ReactionBar({
  on,
  onEmote,
  style,
  big = false,
}: {
  on: boolean;
  onEmote: (e: number) => void;
  style?: React.CSSProperties;
  /** A phone: thumb-sized keys, no key numbers. */
  big?: boolean;
}) {
  const flash = useEmoteKeys(on, onEmote);
  return (
    <div
      className={`${HUD_BOX} flex divide-x-2 divide-border`}
      style={style}
      role="toolbar"
      aria-label="Reactions"
    >
      {EMOTES.map((emoji, i) => (
        <button
          key={i}
          type="button"
          // No focus on click: Space (the handbrake) would press it again.
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => onEmote(i)}
          aria-label={`React ${emoji} (${i + 1})`}
          title={`React (${i + 1})`}
          className={`relative flex items-center justify-center leading-none transition-colors hover:bg-white/5 active:translate-y-px ${big ? "h-11 w-12 text-xl" : "h-9 w-9 text-[16px]"}`}
        >
          <span
            key={flash?.e === i ? flash.at : undefined}
            style={flash?.e === i ? { animation: "emote-key 0.3s ease-out" } : undefined}
            aria-hidden
          >
            {emoji}
          </span>
          {!big && (
            <span className="absolute bottom-0 right-0.5 text-[7px] text-dim" aria-hidden>
              {i + 1}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Phone: a smile that opens the six (`up`: over it, for a button at the bottom, named). */
export function ReactionButton({
  onEmote,
  className,
  up = false,
}: {
  onEmote: (e: number) => void;
  className: string;
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="React"
        aria-expanded={open}
        className={`${className} ${open ? "text-lime" : ""}`}
      >
        <Smile size={up ? 18 : 14} strokeWidth={2.5} aria-hidden />
        {up && "React"}
      </button>
      {open && (
        <div
          className={`${HUD_BOX} absolute right-[-3px] ${up ? "bottom-full mb-2" : "top-full mt-2"} grid animate-[fade-in_0.15s_ease-out_both] grid-cols-[repeat(3,3rem)] divide-border`}
          role="menu"
        >
          {EMOTES.map((emoji, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              aria-label={`React ${emoji}`}
              onClick={() => {
                onEmote(i);
                setOpen(false);
              }}
              className="flex h-12 w-12 items-center justify-center text-[22px] leading-none active:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Keyboard: the last few reactions in the room, newest at the bottom, older ones fading. */
export function ReactionLog({ log, align = "end" }: { log: EmoteLog; align?: "start" | "end" }) {
  const entries = useSyncExternalStore(log.subscribe, log.get, log.get);
  if (entries.length === 0) return null;
  return (
    <ol
      className={`flex flex-col gap-0.5 text-[8px] normal-case ${align === "start" ? "items-start" : "items-end"}`}
      aria-label="Recent reactions"
      aria-live="polite"
    >
      {entries.map((l, i) => (
        <li key={l.key} style={{ opacity: 0.45 + (0.55 * (i + 1)) / entries.length }}>
          <span className="flex animate-[fade-in_0.2s_ease-out_both] items-center gap-1.5 bg-bg/60 px-1.5 py-0.5">
            <span className="h-1.5 w-1.5" style={{ background: carColor(l.name) }} aria-hidden />
            <span className={l.mine ? "text-lime" : "text-muted"}>
              {l.name.startsWith("guest-") ? "guest" : `@${l.name}`}
            </span>
            <span className="text-[11px] leading-none">{EMOTES[l.e]}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
