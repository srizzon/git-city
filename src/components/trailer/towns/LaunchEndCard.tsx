"use client";

import { useEffect, useState } from "react";
import EndCard from "@trailer-kit/EndCard";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { BEAT } from "@/lib/trailer/towns/teaser";
import { BLUE, BUTTON_AT, LENGTH, LOGO, ORANGE } from "@/lib/trailer/towns/launch";
import { DAY_COLORS } from "@/lib/towns/race-view";

// The launch trailer's end card: GIT CITY stamped on, TOWNS stamped on its
// corner (the teaser's lockup, the campaign's mark), the battle's date, and
// the button: a new week starts, Codex scores first and Claude answers at once.

export default function LaunchEndCard({ clock }: { clock: FilmClock }) {
  return (
    <EndCard
      clock={clock}
      beat={BEAT}
      start={LOGO}
      end={LENGTH}
      words={[
        ["GIT", "#e8dcc8"],
        ["CITY", "#c8e64a"],
      ]}
      stamp={{ text: "TOWNS", color: ORANGE }}
      line="BATTLE STARTS OCT 12"
      at={{ name: 1, stamp: 3, line: 5, button: BUTTON_AT }}
      button={<NewWeek clock={clock} />}
    />
  );
}

/** Under the line: MON lights, Codex 1, then Claude 2 half a beat later. */
function NewWeek({ clock }: { clock: FilmClock }) {
  const [b, setB] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setB(beatOf(clock) - LOGO - BUTTON_AT);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock]);
  const codex = b >= 1 ? 1 : 0;
  const claude = b >= 1.5 ? 2 : 0;
  return (
    <div className="absolute inset-x-0 flex justify-center font-pixel" style={{ top: "72%" }}>
      <div className="flex items-center gap-[1.6cqw]" style={{ fontSize: "2.4cqw" }}>
        <span className="tabular-nums" style={{ color: ORANGE, transform: b >= 1.5 && b < 1.7 ? "scale(1.4)" : undefined }}>
          {claude}
        </span>
        <span className="flex items-center gap-[0.6cqw] text-muted">
          <span className="block" style={{ width: "2cqw", height: "2cqw", background: b >= 0 ? DAY_COLORS[3] : "transparent" }} />
          MON
        </span>
        <span className="tabular-nums" style={{ color: BLUE, transform: b >= 1 && b < 1.2 ? "scale(1.4)" : undefined }}>
          {codex}
        </span>
      </div>
    </div>
  );
}
