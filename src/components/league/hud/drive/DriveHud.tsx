"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Gamepad2, LogIn, Pause, Plus, Volume1, Volume2, VolumeX, X } from "lucide-react";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import { HUD_BOX } from "../shared";
import PauseMenu, { CONTROLS, CONTROLS_PT } from "./PauseMenu";
import { useLang } from "@/lib/i18n/LangProvider";
import StartScreen from "./StartScreen";
import DrivePrompt, { type Lesson } from "./DrivePrompt";
import Dash from "./Dash";
import type { HeistSide, KitSlot } from "@/lib/towns/heist";
import TouchControls from "./TouchControls";
import type { TouchDrive } from "@/lib/league-city/drive/touch";
import CrownPanel from "./CrownPanel";
import CopyLink from "./CopyLink";
import SmashNotice from "./SmashNotice";
import type { CrownState } from "@/lib/league-city/drive/crown";
import type { CityBuilding } from "@/lib/github";
import type { CityObject } from "@/lib/league-city/types";
import Minimap from "./Minimap";
import { ChatField, ChatPrompt, ReactionBar, ReactionLog, useChatKey } from "./Reactions";
import type { EmoteLog } from "@/lib/league-city/drive/emote-log";

// Drive mode HUD: the dash (bottom: item, speed, boost), camera, mute and exit
// (top right), prompts that teach each move when it's useful (DrivePrompt), a
// controls hint that fades after 6 s, the start screen while Rapier
// loads, and the pause menu. Speed and boost update from the telemetry object
// every animation frame without re-rendering.
// On the first drive, handed over by the town intro, there's no start screen
// (the intro loaded the car): one prompt teaches the controls and the rest of
// the HUD comes in piece by piece on your first move.
// On a phone (touchRef) the HUD is only Pause (sound and exit are in its menu),
// Games and join up top, others' reactions under Pause, and the touch controls
// (TouchControls, with your reactions) below; the prompts speak touch.
// Signed in (`onChat`), a Chat button (Enter on a keyboard) opens a field to
// type to everyone driving here.

const SEG = "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON_BTN = `${SEG} w-10 justify-center py-2 text-cream hover:text-lime`;
const ICON = { size: 14, strokeWidth: 2.5 } as const;
/** First drive: the HUD comes in on its own after this long, even if you haven't moved. */
const ENTER_ANYWAY_MS = 8000;


export default function DriveHud({
  firstRun = false,
  touchRef,
  telemetry,
  ready,
  camera,
  muted,
  volume,
  paused,
  gated = false,
  held = false,
  join,
  drivers,
  crown,
  map,
  emoteLog,
  onStartCrown,
  gameOn = false,
  onGames,
  startNote = null,
  children,
  kit = null,
  onVolume,
  onEmote,
  onChat,
  onResume,
  onPause,
  onCamera,
  onMute,
  onExit,
}: {
  /** Handed over by the town intro (see above). */
  firstRun?: boolean;
  /** Phone controls: the HUD writes them, the car reads them. */
  touchRef?: React.MutableRefObject<TouchDrive>;
  telemetry: DriveTelemetry;
  ready: boolean;
  camera: DriveCameraMode;
  muted: boolean;
  /** Master volume 0…1 (lib drive/volume). */
  volume: number;
  paused: boolean;
  /** A guest's car stalling or stopped by the sign-in terminal (GuestGate): no lessons over it. */
  gated?: boolean;
  /** The intro's arrival choice is up (ArrivalChoice): the first lesson and the HUD wait for it. */
  held?: boolean;
  /** The top bar's lime button: join the town, or a guest signs in. `short` on a phone. */
  join?: { label: string; short: string; signIn?: boolean; onClick: () => void };
  /** Everyone else driving in this city right now. */
  drivers: DriverInfo[];
  /** Crown Rush state from the drive room. */
  crown: { crown: CrownState; offset: number; you: string | null } | null;
  /** What the minimap draws: the town, and your login (lowercase) for your building. */
  map: { buildings: CityBuilding[]; objects: CityObject[]; home: string | null; layer?: (ctx: CanvasRenderingContext2D, x: number, z: number, reach: number) => void };
  /** The room's last reactions, oldest first. */
  emoteLog: EmoteLog;
  onStartCrown: () => void;
  /** A car game has the screen (a city race you're in): the drivers list and Crown Rush step aside. */
  gameOn?: boolean;
  /** The Games menu (G): a button leads the top-right toolbar. Without it, Crown Rush keeps its own Start. */
  onGames?: () => void;
  /** What's going on here, on the loading band ("4 driving · a race to Campinas is open"). */
  startNote?: string | null;
  /** A town's own HUD pieces (the Brasil map's races), over the rest. */
  children?: React.ReactNode;
  /** The Brasil map's city of the day: your side's weapons in place of the ? box slot. */
  kit?: { slots: KitSlot[]; side: HeistSide } | null;
  onVolume: (v: number) => void;
  /** A quick reaction (lib drive/emotes slot). */
  onEmote: (e: number) => void;
  /** Signed in: send a typed message to the room. */
  onChat?: (text: string) => void;
  onResume: () => void;
  /** A phone's top-left button opens the pause menu (sound, exit); without it, it exits. */
  onPause?: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const { lang, t } = useLang();
  const honk = useRef<HTMLDivElement>(null);
  const honkName = useRef<HTMLSpanElement>(null);
  const [hints, setHints] = useState(true);
  // First drive: the HUD waits for your first move.
  const [entered, setEntered] = useState(!firstRun);
  /** The loading band is gone (no band on the intro's first run): the controls take the bottom. */
  const [loaded, setLoaded] = useState(firstRun);
  const [chatting, setChatting] = useState(false);
  const canChat = !!onChat && ready && entered && !paused && !held;
  useChatKey(canChat && !chatting, () => setChatting(true));
  const enter = firstRun ? (delay: number) => ({ animation: `fade-in 0.45s ease-out ${delay}s both` }) : () => undefined;

  useEffect(() => {
    if (entered || held) return;
    const t = setTimeout(() => setEntered(true), ENTER_ANYWAY_MS);
    return () => clearTimeout(t);
  }, [entered, held]);

  useEffect(() => {
    if (!ready || !entered) return;
    const t = setTimeout(() => setHints(false), 6000);
    return () => clearTimeout(t);
  }, [ready, entered]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (honk.current && honkName.current) {
        honk.current.dataset.on = String(!!telemetry.near);
        if (telemetry.near) honkName.current.textContent = `@${telemetry.near}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  const touch = !!touchRef;
  // Closed, the field's spot says chat is there (Enter, or a tap); open, it's the field.
  const chatField = !canChat ? null : chatting ? (
    <ChatField onSend={(m) => onChat?.(m)} onClose={() => setChatting(false)} className={touch ? "w-full" : "w-[222px]"} />
  ) : (
    <ChatPrompt touch={touch} onOpen={() => setChatting(true)} />
  );
  // A phone in the car: a held thumb must never start selecting text (iOS
  // picks words off hidden page text and the callout covers the controls).
  // Off for the whole page while you drive, and any selection that slips
  // through is dropped at once.
  useEffect(() => {
    if (!touch) return;
    const el = document.documentElement;
    const keep = ["user-select", "-webkit-user-select", "-webkit-touch-callout"].map((k) => [k, el.style.getPropertyValue(k)] as const);
    for (const [k] of keep) el.style.setProperty(k, "none");
    const drop = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) sel.removeAllRanges();
    };
    document.addEventListener("selectionchange", drop);
    return () => {
      document.removeEventListener("selectionchange", drop);
      for (const [k, v] of keep) el.style.setProperty(k, v);
    };
  }, [touch]);
  const silent = muted || volume === 0;
  // The prompt on screen: on a phone its button pulses (and the camera's gets a callout).
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const touchLesson = lesson === "boost" || lesson === "drift" || lesson === "attack" ? lesson : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
      {/* First, so every other piece of the HUD sits above the steering layer. */}
      {ready && loaded && touchRef && <TouchControls touchRef={touchRef} telemetry={telemetry} lesson={touchLesson} onEmote={entered ? onEmote : undefined} kit={kit} />}

      {ready && entered && !touch && !gameOn && (
        <div className={`${HUD_BOX} absolute left-4 top-4 flex flex-col gap-1.5 px-3 py-2 text-[9px]`} style={enter(0)}>
          <p className="flex items-center gap-2 text-cream">
            <span className="h-1.5 w-1.5 animate-pulse bg-lime" aria-hidden />
            {drivers.length + 1} {t("driving now", "dirigindo agora")}
          </p>
          {drivers.length === 0 ? (
            <div className="flex max-w-[180px] flex-col items-start gap-1.5">
              <p className="text-dim normal-case">{t("Share the link to race your team here.", "Manda o link pra correr com a galera aqui.")}</p>
              <CopyLink />
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {drivers.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2" style={{ background: carColor(d.name) }} aria-hidden />
                  {d.name.startsWith("guest-") ? t("guest", "visitante") : `@${d.name}`}
                </li>
              ))}
              {drivers.length > 6 && <li className="text-dim">+{drivers.length - 6} {t("more", "mais")}</li>}
            </ul>
          )}
        </div>
      )}

      {/* Phone: Pause on the left, Games and join on the right, nothing else. */}
      {entered && touch && (
        <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] flex items-start justify-between gap-3" style={enter(0)}>
          <button type="button" onClick={onPause ?? onExit} aria-label={onPause ? t("Pause", "Pausar") : t("Exit", "Sair")} className={`${HUD_BOX} ${ICON_BTN} w-11 py-2.5`}>
            {onPause ? <Pause {...ICON} aria-hidden /> : <X {...ICON} aria-hidden />}
          </button>
          <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border empty:hidden`}>
            {onGames && (
              <button type="button" onClick={onGames} className="flex items-center gap-1.5 bg-lime px-3 py-2.5 text-[10px] text-bg active:translate-y-px">
                <Gamepad2 {...ICON} aria-hidden /> {t("Games", "Jogos")}
              </button>
            )}
            {join && (
              <button type="button" onClick={join.onClick} className={`${SEG} gap-2 px-3 py-2.5 text-[10px] text-lime`}>
                {join.signIn ? <LogIn {...ICON} aria-hidden /> : <Plus {...ICON} aria-hidden />}
                <span>{join.short}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {entered && !touch && (
        <div className={`${HUD_BOX} absolute right-4 top-4 flex items-stretch divide-x-2 divide-border`} style={enter(0.12)}>
          {onGames && (
            <button type="button" onClick={onGames} title={t("Games (G)", "Jogos (G)")} className={`${SEG} gap-2 px-3 py-2 text-[10px] text-lime hover:text-cream`}>
              <Gamepad2 {...ICON} aria-hidden />
              <span>{t("Games", "Jogos")}</span>
              <span className="bg-cream px-1 text-[8px] leading-[1.4] text-bg">G</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCamera}
            aria-label={camera === "chase" ? t("Top-down camera (C)", "Câmera de cima (C)") : t("Chase camera (C)", "Câmera atrás (C)")}
            title={camera === "chase" ? t("Top-down camera (C)", "Câmera de cima (C)") : t("Chase camera (C)", "Câmera atrás (C)")}
            className={ICON_BTN}
          >
            <Camera {...ICON} aria-hidden />
          </button>
          {/* Mute on click; the volume slider opens under it on hover or focus. */}
          <span className="group relative flex">
            <button
              type="button"
              onClick={onMute}
              aria-label={silent ? t("Sound on", "Ligar som") : t("Mute", "Mudo")}
              aria-pressed={silent}
              title={silent ? t("Sound on", "Ligar som") : t("Mute", "Mudo")}
              className={ICON_BTN}
            >
              {silent ? <VolumeX {...ICON} aria-hidden /> : volume < 0.5 ? <Volume1 {...ICON} aria-hidden /> : <Volume2 {...ICON} aria-hidden />}
            </button>
            {/* pt-2, not mt-2: the pointer crosses the gap without closing it. */}
            <span className="absolute right-[-3px] top-full hidden pt-2 group-focus-within:block group-hover:block">
              <label className={`${HUD_BOX} flex items-center gap-3 px-3 py-2.5 text-[9px] text-muted`}>
                <span className="sr-only">{t("Volume", "Volume")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((muted ? 0 : volume) * 100)}
                  onChange={(e) => onVolume(Number(e.target.value) / 100)}
                  className="h-1 w-28 cursor-pointer accent-lime"
                />
                <span className="w-7 text-right tabular-nums text-cream">{Math.round((muted ? 0 : volume) * 100)}</span>
              </label>
            </span>
          </span>
          {join && (
            <button type="button" onClick={join.onClick} className={`${SEG} gap-2 px-3 py-2 text-[10px] text-lime`}>
              {join.signIn ? <LogIn {...ICON} aria-hidden /> : <Plus {...ICON} aria-hidden />}
              <span>{join.label}</span>
            </button>
          )}
          <button type="button" onClick={onExit} className={`${SEG} gap-2 px-3 py-2 text-[10px] text-cream hover:text-lime`}>
            <X {...ICON} aria-hidden />
            <span>{t("Exit", "Sair")}</span>
          </button>
        </div>
      )}

      {ready && !touch && (
        <div
          ref={honk}
          data-on="false"
          className={`${HUD_BOX} absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-[10px] text-cream opacity-0 transition-opacity data-[on=true]:opacity-100`}
        >
          <span className="border-2 border-lime px-1.5 text-lime">H</span>
          {t("Honk at", "Buzinar pra")} <span ref={honkName} className="text-lime" />
        </div>
      )}

      {ready && entered && !touch && (
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2" style={enter(0.2)}>
          <ReactionLog log={emoteLog} />
          {chatField}
          <ReactionBar on={!paused} onEmote={onEmote} />
          <Minimap telemetry={telemetry} buildings={map.buildings} objects={map.objects} home={map.home} size={150} layer={map.layer} />
        </div>
      )}

      {ready && entered && <SmashNotice telemetry={telemetry} touch={touch} />}

      {/* After the loading band has gone: it sits where the dash comes up. */}
      {ready && loaded && entered && !touch && <Dash telemetry={telemetry} style={enter(0.24)} kit={kit} />}

      {/* Phone: no minimap, others' reactions under Pause. */}
      {ready && loaded && entered && touch && (
        <div className="absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] flex flex-col items-start gap-2">
          {chatField}
          <ReactionLog log={emoteLog} align="start" />
        </div>
      )}

      {ready && entered && !touch && (
        <div
          className={`absolute bottom-20 left-4 text-[9px] leading-loose text-muted transition-opacity duration-700 ${hints ? "opacity-100" : "opacity-0"}`}
        >
          {[...CONTROLS, ...(onGames ? ([["G", "games: race, crown rush"]] as [string, string][]) : []), ...(onChat ? ([["Enter", "chat"]] as [string, string][]) : [])].map(([k, v]) => (
            <div key={k}>
              <span className="text-cream">{lang === "pt" ? (CONTROLS_PT[k] ?? k) : k}</span> {lang === "pt" ? (CONTROLS_PT[v] ?? v) : v}
            </div>
          ))}
          <div className="normal-case">{t("Gamepad works too", "Controle também funciona")}</div>
        </div>
      )}

      {ready && !held && (
        <div className={gated ? "hidden" : undefined}>
          <DrivePrompt telemetry={telemetry} firstRun={firstRun} camera={camera} touchRef={touchRef} onDrive={() => setEntered(true)} onLesson={setLesson} />
        </div>
      )}

      {ready && entered && !gameOn && <CrownPanel crown={crown?.crown ?? null} offset={crown?.offset ?? 0} you={crown?.you ?? null} drivers={drivers} touch={touch} idle={!onGames} onStart={onStartCrown} />}
      {ready && entered && children}

      {/* Last, so they blur and cover the rest of the HUD. */}
      {!firstRun && <StartScreen ready={ready} touch={touch} note={startNote} onGone={() => setLoaded(true)} />}
      {paused && ready && (
        <PauseMenu camera={camera} muted={muted} onResume={onResume} onCamera={onCamera} onMute={onMute} onExit={onExit} />
      )}
    </div>
  );
}
