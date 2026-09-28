"use client";

import EndCard from "@trailer-kit/EndCard";
import type { FilmClock } from "@trailer-kit/clock";
import { BEAT } from "@/lib/trailer/towns/teaser";
import { BUMP, BUTTON_AT, LENGTH, LOGO } from "@/lib/trailer/towns/launch";
import CarBump from "@/components/trailer/CarBump";

// The launch trailer's end card: CLAUDE CODE VS CODEX stamped on, the date
// stamped on its corner, PICK A SIDE, and the orange car honking at the X.

const ORANGE = "#e07a4f";
const BLUE = "#5b8def";

export default function LaunchEndCard({ clock }: { clock: FilmClock }) {
  return (
    <EndCard
      clock={clock}
      beat={BEAT}
      start={LOGO}
      end={LENGTH}
      words={[
        ["CLAUDE CODE", ORANGE],
        ["VS", "#e8dcc8"],
        ["CODEX", BLUE],
      ]}
      stamp={{ text: "OCT 12", color: "#c8e64a" }}
      line="PICK A SIDE"
      at={{ name: 1, stamp: 3, line: 5, button: BUTTON_AT, hit: BUTTON_AT + BUMP }}
      size={5.2}
      button={
        <CarBump clock={clock} beat={BEAT} from={LOGO + BUTTON_AT} bump={BUMP} color={ORANGE} stopX={85.5} baseY={48.5} scale={0.55} />
      }
    />
  );
}
