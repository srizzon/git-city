"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { beatOf, type FilmClock } from "./clock";

// A film's end card, as film end cards go: a hard cut to black, then a
// centred lockup with nothing around it. Driven by the film's clock in beats
// after the cut, so a scrub shows what records. With the default beats:
//   0  black, only the echo of the last hit
//   1  the name stamps in, big and centred: stepped, no easing, a flash
//   3  the stamp slams onto its corner like a rubber stamp (a sequel's "2")
//   5  the line types on, small and spaced, right under it
//   8  the button: your game's own gag in the `button` slot (Git City's car
//      rolls in and bumps the last letter, which wobbles and stays up)
// The card holds to the film's end. Its sounds are the film's (SoundCue),
// put on the same beats. Sizes are in the stage's container units (cqw).

const CREAM = "#e8dcc8";

/** Beats into the card. */
export interface CardBeats {
  name: number;
  stamp: number;
  line: number;
  /** When the button starts. */
  button: number;
  /** When the button hits the last letter (it wobbles), if it does. */
  hit?: number;
}

export const CARD_BEATS: CardBeats = { name: 1, stamp: 3, line: 5, button: 8 };

export interface EndCardProps {
  clock: FilmClock;
  /** Seconds per beat. */
  beat: number;
  /** The card's first beat on the timeline (the cut to black), and its last. */
  start: number;
  end: number;
  /** The name, a word at a time: [text, color]. */
  words: [string, string][];
  /** The small word stamped on the name's corner after it lands. */
  stamp: { text: string; color: string };
  /** The line under the name. */
  line: string;
  /**
   * The button: anything drawn over the card from `at.button` on (a canvas
   * with your game's car, a character, a sprite). It stays mounted the whole
   * film, only hidden, so a canvas in it never loses its WebGL context.
   */
  button?: ReactNode;
  at?: CardBeats;
  /** The name's size (cqw, the stage's width in hundredths). A longer name wants it smaller. */
  size?: number;
}

/** The name's letters land this many beats apart. */
const LETTER_EVERY = 0.07;
/** Where the stamp's dust flies: [right, down] per bit. */
const DUST: [number, number][] = [
  [1, -0.6],
  [0.6, -1],
  [-0.2, -1],
  [1, 0.4],
  [0.4, 1],
  [-0.4, 0.9],
];

export default function EndCard({
  clock,
  beat: secondsPerBeat,
  start,
  end,
  words,
  stamp,
  line,
  button,
  at = CARD_BEATS,
  size = 10.5,
}: EndCardProps) {
  // Beats since the cut to black.
  const beat = useCallback(() => beatOf(clock) - start, [clock, start]);
  const length = end - start;
  const [b, setB] = useState(() => beat());
  useEffect(() => {
    let raf = 0;
    let was = NaN;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = beat();
      // Only re-render while the card is on (or just leaving it).
      if (now >= 0 && now < length) setB(now);
      else if (was >= 0 && was < length) setB(now);
      was = now;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beat, length]);
  const active = b >= 0 && b < length;

  const shown = active && b >= at.name;
  const flash = shown && b - at.name < 0.05;
  // The stamp lands like a rubber stamp: big and faint for a frame, then down hard.
  const stampIn = b - at.stamp;
  const stampScale = stampIn < 0.06 ? 1.9 : 1;
  const stampJolt = stampIn >= 0 && stampIn < 0.12 ? 0.12 : 0;
  // The hit: the last letter takes it and wobbles back upright (it doesn't break).
  const since = at.hit === undefined ? -1 : (b - at.hit) * secondsPerBeat;
  const wobble = since > 0 ? -6 * Math.exp(-since * 6) * Math.cos(since * 28) : 0;
  const jolt = (since > 0 && since < 0.06 ? 0.12 : 0) + stampJolt;
  const letters = words.reduce((n, [w]) => n + w.length, 0);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#000",
        visibility: active ? "visible" : "hidden",
      }}
    >
      {shown && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: `translate(${jolt}cqw, ${jolt}cqw)`,
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              gap: `${size * 0.3}cqw`,
              fontSize: `${size}cqw`,
              lineHeight: 1,
            }}
          >
            {/* The name stamps in letter by letter, stepped: each one a frame big, then set. */}
            {words.map(([word, color], wi) => {
              const first = words.slice(0, wi).reduce((n, [w]) => n + w.length, 0);
              return (
                <p key={wi} style={{ display: "flex", margin: 0, color }}>
                  {[...word].map((ch, j) => {
                    const k = first + j;
                    const at0 = at.name + k * LETTER_EVERY;
                    const hit = k === letters - 1 && wobble !== 0;
                    return (
                      <span
                        key={j}
                        style={{
                          display: "inline-block",
                          opacity: b < at0 ? 0 : 1,
                          transform: `${b >= at0 && b - at0 < 0.07 ? "scale(1.25)" : ""} ${hit ? `rotate(${wobble}deg)` : ""}`,
                          transformOrigin: hit ? "left bottom" : "center",
                        }}
                      >
                        {ch === " " ? "\u00a0" : ch}
                      </span>
                    );
                  })}
                </p>
              );
            })}
            {stampIn >= 0 && (
              <div
                style={{
                  position: "absolute",
                  right: "-5.5cqw",
                  top: "-2.6cqw",
                  border: `0.35cqw solid ${stamp.color}`,
                  padding: "0.45cqw 1cqw",
                  fontSize: "2.8cqw",
                  lineHeight: 1,
                  color: stamp.color,
                  background: "#000",
                  transform: `rotate(8deg) scale(${stampScale})`,
                  opacity: stampIn < 0.06 ? 0.35 : 1,
                }}
              >
                {stamp.text}
              </div>
            )}
            {/* Dust off the stamp. */}
            {stampIn > 0.06 &&
              stampIn < 0.7 &&
              DUST.map(([dx, dy], i) => (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    width: "0.6cqw",
                    height: "0.6cqw",
                    right: `${-1 - dx * stampIn * 6}cqw`,
                    top: `${-0.5 + dy * stampIn * 5}cqw`,
                    background: stamp.color,
                    opacity: 1 - stampIn / 0.7,
                  }}
                />
              ))}
          </div>
          {/* The line types on, one letter a step; the padding balances the tracking. */}
          <p
            style={{
              margin: "3cqw 0 0",
              paddingLeft: "0.5em",
              fontSize: "1.6cqw",
              lineHeight: 1,
              letterSpacing: "0.5em",
              color: CREAM,
            }}
          >
            {[...line].map((ch, i) => (
              <span key={i} style={{ opacity: b >= at.line + i * 0.06 ? 0.85 : 0 }}>
                {ch}
              </span>
            ))}
          </p>
        </div>
      )}
      {button && (
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            visibility: shown && b >= at.button ? "visible" : "hidden",
          }}
        >
          {button}
        </div>
      )}
      {flash && <div style={{ position: "absolute", inset: 0, background: "#fff" }} />}
    </div>
  );
}
