"use client";

import { useEffect, useMemo, useState } from "react";

export interface EvolutionPoint {
  id: string;
  label: string;
  subtitle: string;
  contributions: number;
  xp: number;
  stars: number;
  repos: number;
}

interface Props {
  accent: string;
  shadow: string;
  points: EvolutionPoint[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ProfileEvolutionTimeline({ accent, shadow, points }: Props) {
  const [index, setIndex] = useState(points.length - 1);
  const [playing, setPlaying] = useState(false);

  const current = points[index] ?? points[points.length - 1];
  const max = useMemo(
    () => ({
      contributions: Math.max(...points.map((p) => p.contributions), 1),
      xp: Math.max(...points.map((p) => p.xp), 1),
      stars: Math.max(...points.map((p) => p.stars), 1),
      repos: Math.max(...points.map((p) => p.repos), 1),
    }),
    [points],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIndex((prev) => {
        if (prev >= points.length - 1) return 0;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, points.length]);

  if (points.length === 0) return null;

  return (
    <section className="mt-5 border-[3px] border-border bg-bg-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm text-cream">City Evolution Timeline</h2>
        <button
          onClick={() => setPlaying((v) => !v)}
          className="btn-press px-2.5 py-1 text-[10px] text-bg"
          style={{ backgroundColor: accent, boxShadow: `2px 2px 0 0 ${shadow}` }}
        >
          {playing ? "Pause Replay" : "Replay"}
        </button>
      </div>

      <div className="mt-3 rounded-sm border-2 border-border/70 bg-bg-card px-3 py-2">
        <div className="text-[9px] text-muted">{current.subtitle}</div>
        <div className="mt-1 text-xs" style={{ color: accent }}>{current.label}</div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-4">
          {[
            { k: "contributions", label: "Contrib", value: current.contributions, max: max.contributions },
            { k: "xp", label: "XP", value: current.xp, max: max.xp },
            { k: "stars", label: "Stars", value: current.stars, max: max.stars },
            { k: "repos", label: "Repos", value: current.repos, max: max.repos },
          ].map((m) => (
            <div key={m.k}>
              <div className="flex items-center justify-between text-muted">
                <span>{m.label}</span>
                <span style={{ color: accent }}>{formatCompact(m.value)}</span>
              </div>
              <div className="mt-1 h-1.5 border border-border/60 bg-bg">
                <div
                  className="h-full transition-all duration-400"
                  style={{
                    width: `${Math.max(3, Math.round((m.value / m.max) * 100))}%`,
                    backgroundColor: accent,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {points.map((point, i) => (
          <button
            key={point.id}
            onClick={() => {
              setIndex(i);
              setPlaying(false);
            }}
            className="border-2 px-2 py-1 text-[9px] transition-colors"
            style={{
              borderColor: i === index ? accent : "var(--color-border)",
              color: i === index ? accent : "var(--color-muted)",
              backgroundColor: i === index ? `${accent}18` : "transparent",
            }}
          >
            {point.label}
          </button>
        ))}
      </div>
    </section>
  );
}
