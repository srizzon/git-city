"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MessageSquare, Smile } from "lucide-react";
import { CHAT_MAX, EMOTES, emoteForKey } from "@/lib/league-city/drive/emotes";
import { HUD_BOX } from "../shared";
import { carColor } from "@/lib/league-city/drive/net";
import type { EmoteLog } from "@/lib/league-city/drive/emote-log";
import { useT } from "@/lib/i18n/LangProvider";

// Quick reactions in the HUD (lib drive/emotes). On a keyboard: the six slots
// in a row with their keys, 1–6 fires one and its slot flashes. On a phone:
// a smile button that opens the six, a tap sends and closes it. Over the
// row on a keyboard, a small log of the room's last reactions and messages.
// Signed in, Enter (or Chat in the phone's menu) opens a field to type one.

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
  const t = useT();
  const flash = useEmoteKeys(on, onEmote);
  return (
    <div
      className={`${HUD_BOX} flex divide-x-2 divide-border`}
      style={style}
      role="toolbar"
      aria-label={t("Reactions", "Reações")}
    >
      {EMOTES.map((emoji, i) => (
        <button
          key={i}
          type="button"
          // No focus on click: Space (the handbrake) would press it again.
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => onEmote(i)}
          aria-label={t(`React ${emoji} (${i + 1})`, `Reagir ${emoji} (${i + 1})`)}
          title={t(`React (${i + 1})`, `Reagir (${i + 1})`)}
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
  onChat,
  className,
  up = false,
}: {
  onEmote: (e: number) => void;
  /** Signed in: a Chat row under the six opens the field. */
  onChat?: () => void;
  className: string;
  up?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("React", "Reagir")}
        aria-expanded={open}
        className={`${className} ${open ? "text-lime" : ""}`}
      >
        <Smile size={up ? 18 : 14} strokeWidth={2.5} aria-hidden />
        {up && t("React", "Reagir")}
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
              aria-label={t(`React ${emoji}`, `Reagir ${emoji}`)}
              onClick={() => {
                onEmote(i);
                setOpen(false);
              }}
              className="flex h-12 w-12 items-center justify-center text-[22px] leading-none active:bg-white/10"
            >
              {emoji}
            </button>
          ))}
          {onChat && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onChat();
                setOpen(false);
              }}
              className="col-span-3 flex h-11 items-center justify-center gap-2 border-t-2 border-border text-[10px] text-cream active:bg-white/10"
            >
              <MessageSquare size={14} strokeWidth={2.5} aria-hidden />
              Chat
            </button>
          )}
        </div>
      )}
    </span>
  );
}

/** Keyboard: the last few reactions in the room, newest at the bottom, older ones fading. */
export function ReactionLog({ log, align = "end" }: { log: EmoteLog; align?: "start" | "end" }) {
  const t = useT();
  const entries = useSyncExternalStore(log.subscribe, log.get, log.get);
  if (entries.length === 0) return null;
  return (
    <ol
      className={`flex flex-col gap-0.5 text-[8px] normal-case ${align === "start" ? "items-start" : "items-end"}`}
      aria-label={t("Recent reactions", "Reações recentes")}
      aria-live="polite"
    >
      {entries.map((l, i) => (
        <li key={l.key} style={{ opacity: 0.45 + (0.55 * (i + 1)) / entries.length }}>
          <span className="flex animate-[fade-in_0.2s_ease-out_both] items-center gap-1.5 bg-bg/60 px-1.5 py-0.5">
            <span className="h-1.5 w-1.5" style={{ background: carColor(l.name) }} aria-hidden />
            <span className={l.mine ? "text-lime" : "text-muted"}>
              {l.name.startsWith("guest-") ? "guest" : `@${l.name}`}
            </span>
            {l.text ? (
              <span className="max-w-[16rem] break-words text-[9px] leading-snug text-cream">{l.text}</span>
            ) : (
              <span className="text-[11px] leading-none">{EMOTES[l.e]}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Enter opens it while driving (`on`), unless something else has the keys. */
export function useChatKey(on: boolean, open: () => void) {
  const cb = useRef(open);
  useEffect(() => {
    cb.current = open;
  });
  useEffect(() => {
    if (!on) return;
    const down = (ev: KeyboardEvent) => {
      if (ev.code !== "Enter" && ev.code !== "NumpadEnter") return;
      if (ev.repeat || typing() || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      ev.preventDefault();
      cb.current();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [on]);
}

/** The field to type a message: Enter sends, Esc or leaving it closes it (and the car has the keys again). */
export function ChatField({ onSend, onClose, className = "" }: { onSend: (text: string) => void; onClose: () => void; className?: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <form
      className={`${HUD_BOX} flex items-center gap-2 px-2 ${className}`}
      onSubmit={(ev) => {
        ev.preventDefault();
        if (text.trim()) onSend(text);
        onClose();
      }}
    >
      <input
        ref={input}
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => {
          // Esc closes the field, not the drive (the page's Esc pauses).
          if (ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            onClose();
          }
        }}
        onBlur={onClose}
        maxLength={CHAT_MAX}
        enterKeyHint="send"
        autoComplete="off"
        aria-label={t("Message everyone driving here", "Mensagem pra todo mundo dirigindo aqui")}
        placeholder={t("Say something", "Fala alguma coisa")}
        // Driving on a phone turns text selection off for the page (DriveHud); iOS won't type into a field without it.
        style={{ userSelect: "text", WebkitUserSelect: "text" }}
        className="h-9 min-w-0 flex-1 bg-transparent text-[16px] normal-case text-cream outline-none placeholder:text-dim sm:text-[11px]"
      />
      <span className="shrink-0 text-[8px] text-dim tabular-nums" aria-hidden>
        {CHAT_MAX - text.length}
      </span>
    </form>
  );
}

/** Where the field opens, while it's closed: says chat exists and how to open it (Enter, or a tap). */
export function ChatPrompt({ onOpen, touch = false }: { onOpen: () => void; touch?: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      // No focus on click: Space (the handbrake) would press it again.
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={onOpen}
      className={`${HUD_BOX} flex items-center gap-2 px-2.5 text-[10px] text-cream transition-colors hover:text-lime ${touch ? "h-10" : "h-[42px] w-[222px]"}`}
    >
      <MessageSquare size={14} strokeWidth={2.5} className="shrink-0 text-lime" aria-hidden />
      <span className="flex-1 text-left">{t("Chat", "Chat")}</span>
      {!touch && (
        <span className="border-2 border-lime px-1.5 py-0.5 text-[8px] leading-none text-lime" aria-hidden>
          Enter
        </span>
      )}
    </button>
  );
}
