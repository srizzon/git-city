"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { beatOf, type Transport } from "./clock";
import type { Film, Frame, SoundCue } from "./film";
import Titles, { TITLE_CSS } from "./Titles";

// A small editor for a Film (./film), played live in the engine:
// the film in a 16:9 stage, its scenes to pick from (a picked scene loops),
// play, pause, scrub, slow motion, editor keys, and Record, which plays the
// whole film full window with no cursor and no panel after a second of
// black, for a screen recorder to capture. Opened with ?export, it waits for
// tools/export.mjs to drive it frame by frame instead (window.__gg). The film's pictures come from
// `children`, called with the frame on screen; they read the same clock.
//
// The tree never changes shape between editing and recording, so canvases
// inside the stage never remount (a remount drops their WebGL context).
// Music plays through an <audio> element synced to the clock at full speed;
// sound effects go through Web Audio, one source per cue, on their beats.
//
// Styled by its own CSS below, no framework needed. To match your game, pass
// a className that sets the --tk-* variables (colors, and --tk-font).

const RATES = [1, 0.5, 0.25];

const CSS = `
${TITLE_CSS}
/* The defaults weigh nothing (:where), so any class of yours overrides them. */
:where(.tk-studio) {
  --tk-bg: #0d0d0f; --tk-panel: #161618; --tk-line: #2a2a30; --tk-line-hi: #3a3a44;
  --tk-text: #d4cfc4; --tk-muted: #8c8c9c; --tk-accent: #c8e64a; --tk-rec: #ff5a5a;
}
.tk-studio {
  min-height: 100vh; background: var(--tk-bg); color: var(--tk-text); text-transform: uppercase;
  font-family: var(--tk-font, ui-monospace, monospace);
}
.tk-studio button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-transform: inherit; }
.tk-studio.tk-recording, .tk-studio.tk-recording * { cursor: none !important; }
.tk-wrap { margin: 0 auto; display: flex; flex-direction: column; justify-content: center; gap: 12px; min-height: 100vh; box-sizing: border-box; padding: 16px;
  max-width: min(1760px, calc((100vh - 196px) * 16 / 9 + 344px)); }
.tk-top { display: flex; align-items: center; gap: 12px; min-height: 40px; font-size: 12px; }
.tk-title { flex: 1; min-width: 0; color: var(--tk-text); letter-spacing: 0.08em; }
.tk-cmd { display: flex; align-items: center; gap: 10px; max-width: 60%; border: 2px solid var(--tk-line); padding: 8px 10px; font-size: 11px; text-transform: none; color: var(--tk-muted); }
.tk-cmd code { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; user-select: all; color: var(--tk-text); }
.tk-rec { display: flex; align-items: center; gap: 8px; border: 2px solid var(--tk-line) !important; padding: 10px 16px !important; color: var(--tk-text); }
.tk-rec::before { content: ""; width: 8px; height: 8px; background: var(--tk-rec); }
.tk-rec:hover { border-color: var(--tk-rec) !important; }
.tk-export { background: var(--tk-accent) !important; color: var(--tk-bg) !important; padding: 12px 18px !important; }
.tk-export:hover { filter: brightness(1.1); }
.tk-body { display: grid; grid-template-columns: minmax(0, 1fr) 296px; gap: 12px; }
.tk-panel { border: 2px solid var(--tk-line); background: var(--tk-panel); }
.tk-main { display: flex; flex-direction: column; }
.tk-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #000; container-type: inline-size; }
.tk-recording .tk-stage { position: fixed; inset: 0; z-index: 50; aspect-ratio: auto; }
.tk-flash { pointer-events: none; position: absolute; inset: 0; background: #fff; opacity: 0; }
.tk-transport { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 10px 16px 6px; font-size: 12px; }
.tk-time { font-variant-numeric: tabular-nums; color: var(--tk-muted); }
.tk-time b { font-weight: inherit; color: var(--tk-text); }
.tk-keys { display: flex; align-items: center; gap: 4px; }
.tk-key { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; color: var(--tk-text); }
.tk-key:hover { color: var(--tk-accent); }
.tk-key.tk-big { width: 44px; height: 44px; background: var(--tk-accent); color: var(--tk-bg); }
.tk-key.tk-big:hover { filter: brightness(1.1); color: var(--tk-bg); }
.tk-rates { display: flex; justify-content: flex-end; gap: 14px; }
.tk-rates button { color: var(--tk-muted); }
.tk-rates button:hover { color: var(--tk-text); }
.tk-rates button.tk-on { color: var(--tk-accent); }
.tk-vol { display: flex; align-items: center; gap: 6px; color: var(--tk-muted); }
.tk-vol input { width: 64px; accent-color: var(--tk-accent); }
.tk-timeline { position: relative; margin: 0 16px; user-select: none; touch-action: none; cursor: ew-resize; }
.tk-marks { position: relative; height: 16px; font-size: 9px; color: var(--tk-muted); font-variant-numeric: tabular-nums; }
.tk-marks span { position: absolute; top: 0; transform: translateX(-50%); }
.tk-marks span:first-child { transform: none; }
.tk-ruler { position: relative; height: 14px; background: var(--tk-bg); }
.tk-loop { position: absolute; top: 0; bottom: 0; background: var(--tk-line-hi); }
.tk-cut { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--tk-line); }
.tk-head { pointer-events: none; position: absolute; top: 12px; bottom: 0; width: 2px; margin-left: -1px; background: var(--tk-accent); }
.tk-head::before { content: ""; position: absolute; top: -6px; left: -4px; width: 10px; height: 6px; background: var(--tk-accent); }
.tk-hint { margin: 0; padding: 10px 16px 12px; font-size: 10px; text-transform: none; color: var(--tk-muted); }
.tk-hint b { font-weight: inherit; color: var(--tk-text); }
.tk-side { display: flex; flex-direction: column; min-height: 0; }
.tk-side-head { display: flex; justify-content: space-between; padding: 14px 16px 10px; font-size: 11px; color: var(--tk-muted); }
.tk-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px; }
.tk-scene { display: flex; width: 100%; gap: 10px; align-items: baseline; border: 2px solid transparent !important; padding: 10px 8px !important; text-align: left; font-size: 12px; color: var(--tk-muted); }
.tk-scene:hover { color: var(--tk-text); }
.tk-scene.tk-on { border-color: var(--tk-accent) !important; color: var(--tk-accent); }
.tk-scene i { width: 18px; flex-shrink: 0; font-style: normal; color: var(--tk-line-hi); }
.tk-scene.tk-on i { color: inherit; }
.tk-scene span { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tk-scene small { font-size: inherit; font-variant-numeric: tabular-nums; }
.tk-all { margin: 0 8px; width: auto; }
.tk-rule { flex-shrink: 0; height: 2px; margin: 6px 16px; background: var(--tk-line); }
.tk-recording .tk-top, .tk-recording .tk-transport, .tk-recording .tk-timeline, .tk-recording .tk-hint, .tk-recording .tk-side { display: none; }
.tk-recording .tk-panel { border: 0; }
@media (max-width: 900px) { .tk-body { grid-template-columns: 1fr; } .tk-list { max-height: 50vh; } .tk-transport { grid-template-columns: auto 1fr; } .tk-rates { display: none; } }
`;

/** Pixel icons for the transport, drawn on an 8×8 grid. */
function Icon({ name }: { name: "play" | "pause" | "prev" | "next" }) {
  const rects: Record<typeof name, [number, number, number, number][]> = {
    play: [
      [2, 0, 1, 8],
      [3, 1, 1, 6],
      [4, 2, 1, 4],
      [5, 3, 1, 2],
    ],
    pause: [
      [1, 0, 2, 8],
      [5, 0, 2, 8],
    ],
    prev: [
      [0, 0, 2, 8],
      [5, 0, 2, 8],
      [4, 1, 1, 6],
      [3, 2, 1, 4],
      [2, 3, 1, 2],
    ],
    next: [
      [6, 0, 2, 8],
      [1, 0, 2, 8],
      [3, 1, 1, 6],
      [4, 2, 1, 4],
      [5, 3, 1, 2],
    ],
  };
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden
    >
      {rects[name].map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  );
}

/** Web Audio for the effects: files decoded once, woken by the first key or click (autoplay rules). */
function useSoundEffects(sounds: SoundCue[], volume: { current: number }) {
  const play = useRef<((c: SoundCue) => void) | null>(null);
  useEffect(() => {
    let ctx: AudioContext | null = null;
    const buffers = new Map<string, Promise<AudioBuffer | null>>();
    const load = (src: string) => {
      if (!ctx) return null;
      const c = ctx;
      if (!buffers.has(src))
        buffers.set(
          src,
          fetch(src)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(src))))
            .then((b) => c.decodeAudioData(b))
            .catch(() => null),
        );
      return buffers.get(src)!;
    };
    const wake = () => {
      ctx ??= new AudioContext();
      void ctx.resume();
      for (const c of sounds) load(c.src);
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    play.current = (cue) => {
      wake();
      const c = ctx;
      void load(cue.src)?.then((buf) => {
        if (!buf || !c) return;
        const node = c.createBufferSource();
        node.buffer = buf;
        node.playbackRate.value = cue.rate ?? 1;
        const gain = c.createGain();
        gain.gain.value = cue.gain * volume.current;
        node.connect(gain).connect(c.destination);
        node.loop = cue.dur !== undefined && cue.dur > buf.duration;
        node.start();
        if (cue.dur !== undefined) {
          gain.gain.setTargetAtTime(0, c.currentTime + cue.dur - 0.08, 0.04);
          node.stop(c.currentTime + cue.dur + 0.2);
        }
      });
    };
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      void ctx?.close();
    };
  }, [sounds, volume]);
  return play;
}

export default function Studio<S extends string>({
  film,
  clock,
  onReset,
  className = "",
  title = "",
  exportCommand,
  children,
}: {
  film: Film<S>;
  clock: Transport;
  /** A new take, a loop, or a seek back: put the world back as it was (rebuild anything a take broke). */
  onReset: () => void;
  /** Added to the root, to set the --tk-* variables (colors, --tk-font). */
  className?: string;
  /** The film's name, top left. */
  title?: string;
  /** What the Export button copies. Default: `npm run trailer:export -- <this page>` (the kit README, "Export"). */
  exportCommand?: string;
  /** The pictures for the frame on screen. */
  children: (frame: Frame<S>) => ReactNode;
}) {
  const { beat: BEAT, length: LENGTH, scenes: SCENES } = film;
  const preroll = 1 / BEAT;
  const [scene, setScene] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [recording, setRecording] = useState(false);
  const [frame, setFrame] = useState<Frame<S>>(() => film.frameAt(0));
  const [titles, setTitles] = useState<number[]>([]);
  const flash = useRef<HTMLDivElement>(null);
  const clockText = useRef<HTMLSpanElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const range = useRef<[number, number]>([0, LENGTH]);
  const [shownRange, setShownRange] = useState<[number, number]>([0, LENGTH]);
  const rec = useRef(false);
  const exporting = useRef(false);
  const [command, setCommand] = useState<string | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  // The editor's volume (music and effects), remembered in this browser. Export mixes at full volume.
  const [volume, setVolume] = useState(1);
  const vol = useRef(1);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tk-volume");
      const v = Number(saved);
      if (saved !== null && v >= 0 && v <= 1) setVolume(v);
    } catch {
      // storage blocked: full volume
    }
  }, []);
  useEffect(() => {
    vol.current = volume;
    if (audio.current) audio.current.volume = volume;
    try {
      localStorage.setItem("tk-volume", String(volume));
    } catch {
      // storage blocked: not remembered
    }
  }, [volume]);
  const sfx = useSoundEffects(film.sounds, vol);
  const reset = useRef(onReset);
  useEffect(() => {
    reset.current = onReset;
  }, [onReset]);

  useEffect(() => {
    if (!film.song) return;
    const a = new Audio(film.song.src);
    a.preload = "auto";
    audio.current = a;
    return () => a.pause();
  }, [film.song]);

  const syncAudio = useCallback(
    (beat: number, on: boolean) => {
      const a = audio.current;
      if (!a) return;
      if (!on || clock.rate !== 1 || exporting.current) return a.pause();
      const go = () => {
        a.currentTime = (film.song?.offset ?? 0) + Math.max(0, beatOf(clock)) * BEAT;
        a.volume = vol.current;
        a.play().catch(() => {
          // no song file yet (tools/music.mjs): silent
        });
      };
      if (beat < 0) window.setTimeout(go, (-beat * BEAT * 1000) / clock.rate);
      else go();
    },
    [clock, film.song, BEAT],
  );

  /** Jump to `beat`, playing or paused. Going back resets the world. */
  const seek = useCallback(
    (beat: number, play: boolean) => {
      if (beat < beatOf(clock) - 0.01) reset.current();
      if (play) clock.play(beat);
      else clock.hold(beat);
      syncAudio(beat, play);
    },
    [clock, syncAudio],
  );

  const setRange = (r: [number, number]) => {
    range.current = r;
    setShownRange(r);
  };
  const pick = (i: number | null) => {
    setScene(i);
    setRange(i === null ? [0, LENGTH] : [SCENES[i].start, SCENES[i].end]);
    reset.current();
    seek(range.current[0], playing);
  };
  const toggle = () => {
    const next = !playing;
    setPlaying(next);
    seek(beatOf(clock), next);
  };
  const changeRate = (r: number) => {
    const beat = beatOf(clock);
    clock.speed(r);
    setRate(r);
    seek(beat, playing);
  };
  const record = () => {
    rec.current = true;
    setRecording(true);
    setScene(null);
    setRange([-preroll, LENGTH]);
    clock.speed(1);
    setRate(1);
    reset.current();
    setPlaying(true);
    seek(-preroll, true);
  };
  // Export mode: tools/export.mjs stops the page's clocks, calls start(), and
  // steps the film frame by frame. The sound is mixed from info(), so none plays here.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("export")) return;
    const w = window as unknown as { __gg?: unknown };
    w.__gg = {
      info: () => ({
        beat: film.beat,
        length: film.length,
        song: film.song ?? null,
        sounds: film.sounds,
      }),
      start: () => {
        exporting.current = true;
        rec.current = true;
        setRecording(true);
        setScene(null);
        setRange([0, LENGTH]);
        clock.speed(1);
        setRate(1);
        reset.current();
        setPlaying(true);
        clock.play(0);
      },
    };
    return () => {
      delete w.__gg;
    };
  }, [film, clock, LENGTH]);

  const exportFilm = () => {
    const url = window.location.origin + window.location.pathname;
    const cmd = exportCommand ?? `npm run trailer:export -- ${url}`;
    setCommand(cmd);
    void navigator.clipboard?.writeText(cmd).catch(() => {
      // no clipboard (http, or denied): the command stays on screen to select
    });
  };

  const stopRecord = useCallback(() => {
    rec.current = false;
    setRecording(false);
    setPlaying(false);
    setScene(null);
    range.current = [0, LENGTH];
    setShownRange(range.current);
    seek(0, false);
  }, [seek, LENGTH]);

  // Editor keys: Space plays, arrows step a frame (Shift: a beat), J/L a second,
  // Home/End the scene's ends, 1-9 a scene, 0 the film, [ ] the speed, Shift+R records.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (rec.current) {
        if (e.code === "Escape") stopRecord();
        return;
      }
      if (e.code === "Escape") {
        setCommand(null);
        return;
      }
      const [a, b] = range.current;
      const to = (beat: number) => {
        setPlaying(false);
        seek(Math.min(b - 0.001, Math.max(a, beat)), false);
      };
      const now = beatOf(clock);
      const k = e.code;
      if (k === "Space" || k === "KeyK") toggle();
      else if (k === "ArrowLeft") to(now - (e.shiftKey ? 1 : 1 / 60 / BEAT));
      else if (k === "ArrowRight") to(now + (e.shiftKey ? 1 : 1 / 60 / BEAT));
      else if (k === "KeyJ") to(now - 1 / BEAT);
      else if (k === "KeyL") to(now + 1 / BEAT);
      else if (k === "Home") to(a);
      else if (k === "End") to(b);
      else if (/^Digit[1-9]$/.test(k) && Number(k.slice(5)) <= SCENES.length)
        pick(Number(k.slice(5)) - 1);
      else if (k === "Digit0") pick(null);
      else if (k === "BracketLeft")
        changeRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(rate) + 1)]);
      else if (k === "BracketRight") changeRate(RATES[Math.max(0, RATES.indexOf(rate) - 1)]);
      else if (k === "KeyR" && e.shiftKey) record();
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Every frame: loop the range, fire sounds on their beats, move the scrubber,
  // flash on the film's hits, and change cuts and titles when they change.
  useEffect(() => {
    let raf = 0;
    let key = "";
    let last = beatOf(clock);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      let beat = beatOf(clock);
      const [a, b] = range.current;
      if (clock.held === null && clock.rate === 1 && beat > last && !exporting.current)
        for (const c of film.sounds) if (last < c.beat && beat >= c.beat) sfx.current?.(c);
      last = beat;
      if (clock.held === null && beat >= b) {
        if (rec.current) {
          clock.hold(b - 0.001);
          audio.current?.pause();
        } else {
          reset.current();
          clock.play(a);
          syncAudio(a, true);
        }
        beat = beatOf(clock);
        last = beat - 0.001;
      }
      const f = film.frameAt(beat);
      const on = film.titles.flatMap((c, i) => (beat >= c.start && beat < c.end ? [i] : []));
      const next = JSON.stringify([f, on]);
      if (next !== key) {
        key = next;
        setFrame(f);
        setTitles(on);
      }
      if (head.current)
        head.current.style.left = `${(Math.min(LENGTH, Math.max(0, beat)) / LENGTH) * 100}%`;
      if (clockText.current) clockText.current.textContent = Math.max(0, beat * BEAT).toFixed(2);
      let k = 0;
      for (const x of film.flashes) {
        const since = (beat - x) * BEAT;
        if (since >= 0 && since < 0.25) k = Math.max(k, 0.55 * (1 - since / 0.25));
      }
      if (flash.current) flash.current.style.opacity = String(k);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock, syncAudio, film, sfx, BEAT, LENGTH]);

  const [r0, r1] = shownRange;
  // The ruler scrubs the whole film; scrubbing out of a picked scene goes back to the film.
  const scrubTo = (e: PointerEvent<HTMLDivElement>) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return;
    const beat = Math.min(
      LENGTH - 0.001,
      Math.max(0, ((e.clientX - box.left) / box.width) * LENGTH),
    );
    const [a, b] = range.current;
    if (beat < a || beat >= b) {
      setScene(null);
      setRange([0, LENGTH]);
    }
    seek(beat, playing);
  };
  const pct = (beat: number) => `${(Math.max(0, beat) / LENGTH) * 100}%`;

  // Marks every 1, 2, 5 or 10 seconds, whichever keeps them to a dozen or fewer.
  const seconds = LENGTH * BEAT;
  const step = [1, 2, 5, 10, 15, 30].find((x) => seconds / x <= 12) ?? 60;
  const marks = Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step);
  const jump = (by: number) => {
    const beat = beatOf(clock);
    const at =
      scene ??
      Math.max(
        0,
        SCENES.findIndex((sc) => beat >= sc.start && beat < sc.end),
      );
    pick(Math.min(SCENES.length - 1, Math.max(0, at + by)));
  };

  return (
    <main className={`tk-studio ${recording ? "tk-recording" : ""} ${className}`}>
      <style>{CSS}</style>
      <div className="tk-wrap">
        <header className="tk-top">
          <span className="tk-title">{title}</span>
          {command && (
            <div className="tk-cmd">
              <span>Copied</span>
              <code>{command}</code>
              <button type="button" onClick={() => setCommand(null)} aria-label="Close">
                ×
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={record}
            className="tk-rec"
            title="Full window, no cursor, 1s of black, then the whole film. Esc stops."
          >
            Record
          </button>
          <button type="button" onClick={exportFilm} className="tk-export">
            Export mp4
          </button>
        </header>

        <div className="tk-body">
          <section className="tk-panel tk-main">
            <div className="tk-stage">
              {children(frame)}
              <Titles cues={titles.map((i) => film.titles[i])} />
              <div ref={flash} className="tk-flash" />
            </div>

            <div className="tk-transport">
              <span className="tk-time">
                <b ref={clockText}>0.00</b> / {seconds.toFixed(2)}s
              </span>
              <div className="tk-keys">
                <button
                  type="button"
                  onClick={() => jump(-1)}
                  className="tk-key"
                  aria-label="Previous scene"
                >
                  <Icon name="prev" />
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  className="tk-key tk-big"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  <Icon name={playing ? "pause" : "play"} />
                </button>
                <button
                  type="button"
                  onClick={() => jump(1)}
                  className="tk-key"
                  aria-label="Next scene"
                >
                  <Icon name="next" />
                </button>
              </div>
              <div className="tk-rates">
                <label className="tk-vol">
                  Vol
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    onKeyDown={(e) => e.preventDefault()}
                    aria-label="Volume"
                  />
                </label>
                {RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => changeRate(r)}
                    className={rate === r ? "tk-on" : ""}
                  >
                    {String(r).replace(/^0/, "")}×
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={track}
              className="tk-timeline"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubTo(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons) scrubTo(e);
              }}
            >
              <div className="tk-marks">
                {marks.map((m) => (
                  <span key={m} style={{ left: `${(m / seconds) * 100}%` }}>
                    {m}s
                  </span>
                ))}
              </div>
              <div className="tk-ruler">
                {scene !== null && (
                  <div
                    className="tk-loop"
                    style={{ left: pct(r0), width: pct(r1 - Math.max(0, r0)) }}
                  />
                )}
                {SCENES.slice(1).map((sc) => (
                  <div key={sc.name} className="tk-cut" style={{ left: pct(sc.start) }} />
                ))}
              </div>
              <div ref={head} className="tk-head" />
            </div>

            <p className="tk-hint">
              <b>Space</b> play · <b>← →</b> frame · <b>Shift ← →</b> beat · <b>1–9</b> scene ·{" "}
              <b>[ ]</b> speed · <b>Shift R</b> record
            </p>
          </section>

          <nav className="tk-panel tk-side" aria-label="Scenes">
            <div className="tk-side-head">
              <span>Scenes</span>
              <span>{SCENES.length}</span>
            </div>
            <button
              type="button"
              onClick={() => pick(null)}
              className={`tk-scene tk-all ${scene === null ? "tk-on" : ""}`}
            >
              <i>0</i>
              <span>Whole film</span>
              <small>{seconds.toFixed(1)}s</small>
            </button>
            <div className="tk-rule" />
            <div className="tk-list">
              {SCENES.map((sc, i) => (
                <button
                  key={sc.name}
                  type="button"
                  onClick={() => pick(scene === i ? null : i)}
                  className={`tk-scene ${scene === i ? "tk-on" : ""}`}
                >
                  <i>{i + 1}</i>
                  <span>{sc.name}</span>
                  <small>{((sc.end - sc.start) * BEAT).toFixed(1)}s</small>
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}
