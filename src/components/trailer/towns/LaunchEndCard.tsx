"use client";

import EndCard from "@trailer-kit/EndCard";
import type { FilmClock } from "@trailer-kit/clock";
import { BEAT } from "@/lib/trailer/towns/teaser";
import { CARD_END, LOGO, ORANGE } from "@/lib/trailer/towns/launch";

// The launch trailer's end card: GIT CITY stamped on, TOWNS stamped on its
// corner (the teaser's lockup, the campaign's mark), and the verb with the
// date. The button comes after it, in the overlay: the same email, landing
// on the other side.

export default function LaunchEndCard({ clock }: { clock: FilmClock }) {
  return (
    <EndCard
      clock={clock}
      beat={BEAT}
      start={LOGO}
      end={CARD_END}
      words={[
        ["GIT", "#e8dcc8"],
        ["CITY", "#c8e64a"],
      ]}
      stamp={{ text: "TOWNS", color: ORANGE }}
      line="PICK A SIDE · OCT 12"
      at={{ name: 1, stamp: 3, line: 5, button: 99 }}
    />
  );
}
