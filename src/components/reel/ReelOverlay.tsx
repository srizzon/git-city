"use client";

import { useEffect, useRef, type RefObject } from "react";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import type { Reel, ReelBalloon, ReelPanel } from "@/lib/reel/film";
import type { ReelSpec } from "@/lib/reel/spec";
import type { CityBuilding } from "@/lib/github";
import { levelProgress, rankFromLevel, tierFromLevel, xpForLevel } from "@/lib/xp";

// A reel's words over its world: the rule fixed up top that turns into the
// call to action, each caption line a word at a time as it is spoken
// (keywords lime), white caps with a black outline and no box, and the
// balloon a rig pins over a roof (a plate that bursts into office badges).
// Read from the film's clock every frame, so a scrub shows what records.
//
// Everything sits in Instagram's safe zone (Meta's Reels spec): clear of the
// top 14%, the bottom 35%, 6% at the sides and the bottom-right rail;
// centred on the frame (never off-centre), between 14% and 65% down, at
// most 72% wide.

const FADE = 0.15; // s

type BadgeKind = "governor" | "senator" | "mayor" | "president" | "founder";

/** Each office's title and pixel icon ([x, y, w, h] on an 8×8 grid). */
const BADGES: Record<BadgeKind, { title: string; color: string; pixels: number[][] }> = {
  // A crown: three points, a band.
  governor: { title: "governador", color: "var(--color-lime)", pixels: [[0, 2, 1, 4], [3, 1, 2, 5], [7, 2, 1, 4], [1, 4, 6, 2], [0, 6, 8, 1]] },
  // A star.
  president: { title: "presidente", color: "var(--color-lime)", pixels: [[3, 0, 2, 2], [0, 2, 8, 2], [1, 4, 6, 1], [1, 5, 2, 2], [5, 5, 2, 2]] },
  // A column with its capital and base.
  senator: { title: "senador", color: "var(--color-cream)", pixels: [[1, 0, 6, 1], [2, 1, 1, 6], [5, 1, 1, 6], [3.5, 1, 1, 6], [0, 7, 8, 1]] },
  // A house.
  mayor: { title: "prefeito", color: "var(--color-cream)", pixels: [[3, 0, 2, 1], [2, 1, 4, 1], [1, 2, 6, 1], [1, 3, 6, 5]] },
  // A flag on its pole.
  founder: { title: "fundador", color: "var(--color-cream)", pixels: [[1, 0, 1, 8], [2, 1, 5, 1], [2, 2, 4, 1], [2, 3, 5, 1], [2, 4, 4, 1], [0, 7, 3, 1]] },
};

/** Ease-out-back: past full size, then settles. */
function back(x: number) {
  const c = 1.7;
  return x <= 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

/**
 * Moves balloon `index` of the overlay's balloons (stage percent) and shows its plate until the first
 * badge's moment, then each badge as its moment comes (popping in over
 * 0.4s), the next one replacing it. null hides it.
 */
export function placeBalloon(
  container: HTMLDivElement | null,
  index: number,
  at: { left: number; top: number; opacity: number; badges: number[]; t: number; roof?: { x: number; y: number } } | null,
) {
  if (!container) return;
  // One balloon at a time: the others hide.
  container.querySelectorAll<HTMLElement>("[data-balloon]").forEach((x) => {
    if (Number(x.dataset.balloon) !== index || !at) x.style.opacity = "0";
  });
  const el = container.querySelector<HTMLElement>(`[data-balloon="${index}"]`);
  if (!el || !at) return;
  el.style.opacity = String(at.opacity);
  // Where its building's roof is on screen (0–1), for the export's report.
  if (at.roof) {
    el.dataset.roofX = String(at.roof.x);
    el.dataset.roofY = String(at.roof.y);
  }
  el.style.left = `${at.left}%`;
  el.style.top = `${at.top}%`;
  const ks = at.badges.map((m) => back(Math.min(1, Math.max(0, (at.t - m) / 0.4))));
  const show = (key: string, k: number) => {
    const c = el.querySelector<HTMLElement>(`[data-tag="${key}"]`);
    if (!c) return;
    c.style.opacity = String(Math.min(1, Math.max(0, k * 2)));
    c.style.transform = `scale(${Math.max(0.001, k)})`;
  };
  show("plate", (ks[0] ?? 0) > 0 ? 0 : 1);
  ks.forEach((k, i) => show(String(i), (ks[i + 1] ?? 0) > 0 ? 0 : k));
}

/**
 * Where each overlay is on the stage this frame, in fractions (0–1): the
 * header (rule or call to action, whichever shows), the caption line's
 * spoken words and the balloon. The export records it per frame for the
 * safe-zone check (lib/reel/check), so nobody screenshots the 3D city.
 */
export function overlayBoxes(stage: HTMLElement): { name: string; x: number; y: number; w: number; h: number }[] {
  const s = stage.getBoundingClientRect();
  return [...stage.querySelectorAll<HTMLElement>("[data-reel-box]")].flatMap((el) => {
    if (Number(el.style.opacity || 1) < 0.5) return [];
    let r: DOMRect;
    if (el.dataset.reelBox === "balloon") r = el.getBoundingClientRect();
    else {
      // The text itself, not its box: a caption line's box is wider than its words.
      const range = document.createRange();
      range.selectNodeContents(el);
      r = range.getBoundingClientRect();
    }
    if (!r.width || !r.height) return [];
    const box = { name: el.dataset.reelBox!, x: (r.left - s.left) / s.width, y: (r.top - s.top) / s.height, w: r.width / s.width, h: r.height / s.height };
    // A balloon's building: where its roof is (a point).
    const roof = el.dataset.roofY ? [{ name: "roof", x: Number(el.dataset.roofX), y: Number(el.dataset.roofY), w: 0, h: 0 }] : [];
    return [box, ...roof];
  });
}

/** "dia 1 · *0 devs*" → spans, the starred words lime. */
function Lit({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith("*") ? (
          <span key={i} className="text-lime">
            {part.slice(1, -1)}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

const SIZE = { big: "7.4cqw", small: "4.6cqw" } as const;
const outline = (w: number) => ({
  WebkitTextStroke: `${w}cqw #000`,
  paintOrder: "stroke fill" as const,
  textShadow: `0 ${w / 2}cqw 0 #000`,
});

function HeaderLines({ lines }: { lines: NonNullable<ReelSpec["header"]>["rule"] }) {
  return (
    <>
      {lines.map((l, i) => (
        <p key={i} style={{ fontSize: SIZE[l.size], lineHeight: 1, marginTop: i ? "1.8cqw" : 0, textTransform: l.plain ? "none" : undefined }}>
          <Lit text={l.text} />
        </p>
      ))}
    </>
  );
}

const clamp = (u: number) => Math.min(1, Math.max(0, u));
const ease = (u: number) => 1 - Math.pow(1 - clamp(u), 3);

/**
 * Animates the panels each frame: a panel fades in from its moment and out
 * 0.3s after its end; bars grow to their value one after another; a roster
 * shows its rows a page at a time, each row sliding in after the one above.
 */
function drawPanels(root: HTMLElement, panels: readonly ReelPanel[], t: number) {
  panels.forEach((p, i) => {
    const el = root.querySelector<HTMLElement>(`[data-panel="${i}"]`);
    if (!el) return;
    const on = t >= p.from && t < p.to + 0.3;
    el.style.opacity = on ? String(Math.min(1, (t - p.from) / FADE, (p.to + 0.3 - t) / 0.3)) : "0";
    if (!on) return;
    const local = t - p.from;
    if (p.kind === "counter") {
      const n = Math.max(1, Math.min(p.value, Math.round(1 + ((t - p.from) / Math.max(0.001, p.reach - p.from)) * (p.value - 1))));
      const num = el.querySelector<HTMLElement>("[data-n]");
      if (num && num.textContent !== String(n)) num.textContent = String(n);
      return;
    }
    if (p.kind === "profile") {
      // Slides up into place, as the app's card does on a click.
      const k = ease(local / 0.25);
      el.style.transform = `translate(-50%, ${(1 - k) * 8}cqw)`;
      return;
    }
    if (p.kind === "poster") {
      // Slammed in from big and tilted, then still.
      const k = clamp(local / 0.16);
      el.style.transform = `translate(-50%, 0) scale(${1.5 - 0.5 * k * k}) rotate(${-3 - 5 * (1 - k)}deg)`;
      return;
    }
    if (p.kind === "follow") {
      // Popped in, settling just under full size; its button tapped at `done`.
      const k = clamp(local / 0.18);
      el.style.transform = `translate(-50%, 0) scale(${0.88 * (0.6 + 0.4 * (1 - (1 - k) ** 3) + 0.06 * Math.sin(Math.PI * k))})`;
      const done = t >= p.done;
      const btn = el.querySelector<HTMLElement>("[data-follow]");
      if (btn && btn.dataset.done !== String(done)) {
        btn.dataset.done = String(done);
        btn.textContent = done ? "Seguindo" : "Seguir";
        btn.style.background = done ? "#262626" : "#0095f6";
        const f = el.querySelector<HTMLElement>("[data-followers]");
        if (f) f.textContent = done ? (f.dataset.after ?? f.textContent) : (f.dataset.before ?? f.textContent);
      }
      return;
    }
    if (p.kind === "bars") {
      el.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar, k) => {
        bar.style.transform = `scaleX(${ease((local - k * 0.08) / 0.5)})`;
      });
      return;
    }
    const pages = Math.ceil(p.rows.length / p.perPage);
    const page = Math.min(pages - 1, Math.floor((local / Math.max(0.001, p.to - p.from)) * pages));
    const since = local - (page * (p.to - p.from)) / pages;
    el.querySelectorAll<HTMLElement>("[data-row]").forEach((row) => {
      const n = Number(row.dataset.row);
      const k = n - page * p.perPage;
      const shown = k >= 0 && k < p.perPage;
      row.style.display = shown ? "" : "none";
      if (!shown) return;
      const e = ease((since - k * 0.07) / 0.3);
      row.style.opacity = String(e);
      row.style.transform = `translateY(${(1 - e) * 1.5}cqw)`;
    });
  });
}

/** A building's card, laid out as the app's (home-client's building card), in container units. */
function ProfilePanel({ index, b }: { index: number; b: CityBuilding }) {
  const level = b.xp_level ?? 1;
  const tier = tierFromLevel(level);
  const rank = rankFromLevel(level);
  const progress = levelProgress(b.xp_total ?? 0);
  const xpNow = (b.xp_total ?? 0) - xpForLevel(level);
  const xpNeed = xpForLevel(level + 1) - xpForLevel(level);
  const stats = [
    ["Rank", `#${b.rank}`],
    ["Contribs", b.contributions.toLocaleString("en-US")],
    ["Repos", b.public_repos.toLocaleString("en-US")],
    ["Stars", b.total_stars.toLocaleString("en-US")],
    ["+1s", (b.kudos_count ?? 0).toLocaleString("en-US")],
    ["Visits", (b.visit_count ?? 0).toLocaleString("en-US")],
  ];
  return (
    <div
      data-panel={index}
      data-reel-box="profile"
      className="absolute border-border bg-bg-raised font-pixel"
      style={{ left: "50%", top: "24%", width: "72cqw", borderWidth: "0.8cqw", opacity: 0, transform: "translate(-50%, 0)" }}
    >
      <div style={{ padding: "3.4cqw 3.8cqw 2.6cqw", background: `linear-gradient(135deg, ${tier.color}1c 0%, ${tier.color}06 55%, transparent 100%)` }}>
        <div className="flex items-center" style={{ gap: "3cqw" }}>
          {b.avatar_url && (
            <div className="shrink-0" style={{ border: `0.5cqw solid ${tier.color}`, padding: "0.4cqw", background: `${tier.color}14` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is */}
              <img src={b.avatar_url} alt="" className="border-border" style={{ width: "11cqw", height: "11cqw", borderWidth: "0.25cqw", imageRendering: "pixelated", display: "block" }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {b.name && (
              <p className="truncate text-cream" style={{ fontSize: "3.8cqw", lineHeight: 1.2 }}>
                {b.name}
              </p>
            )}
            <p className="truncate text-muted" style={{ fontSize: "2.8cqw", lineHeight: 1.4 }}>
              @{b.login}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center" style={{ gap: "2.6cqw", margin: "0.4cqw 3.8cqw 2.6cqw" }}>
        <span className="flex shrink-0 items-center justify-center font-bold" style={{ width: "8cqw", height: "8cqw", border: `0.5cqw solid ${tier.color}`, color: tier.color, background: `${tier.color}10`, fontSize: "3.2cqw" }}>
          {level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline" style={{ gap: "1.4cqw" }}>
            <span className="truncate font-bold text-cream" style={{ fontSize: "2.8cqw" }}>
              Lv {level} · {rank.title}
            </span>
            <span className="shrink-0 font-bold" style={{ fontSize: "2cqw", padding: "0.2cqw 1cqw", background: `${tier.color}22`, color: tier.color, letterSpacing: "0.1em" }}>
              {tier.name.toUpperCase()}
            </span>
          </div>
          <div className="bg-border" style={{ marginTop: "1cqw", height: "1.4cqw" }}>
            <div className="h-full" style={{ width: `${Math.max(2, Math.round(progress * 100))}%`, background: tier.color }} />
          </div>
          <p className="text-dim" style={{ marginTop: "0.6cqw", fontSize: "2cqw" }}>
            {xpNow.toLocaleString("en-US")} / {xpNeed.toLocaleString("en-US")} XP
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 border-border/50" style={{ gap: "0.25cqw", margin: "0 3.8cqw 3.8cqw", borderWidth: "0.25cqw", background: "color-mix(in srgb, var(--color-border) 30%, transparent)" }}>
        {stats.map(([k, v]) => (
          <div key={k} className="bg-bg-card text-center" style={{ padding: "2cqw" }}>
            <div className="text-lime" style={{ fontSize: "3.4cqw" }}>
              {v}
            </div>
            <div className="text-muted" style={{ fontSize: "2.2cqw", marginTop: "0.6cqw" }}>
              {k}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A panel by kind: a list (bars, roster), a counter, a poster, a building's card or the profile card. */
function Panel({
  panel,
  index,
  photoOf,
  buildingOf,
}: {
  panel: ReelPanel;
  index: number;
  photoOf: (login: string) => string | null;
  buildingOf: (login: string) => CityBuilding | null;
}) {
  if (panel.kind === "bars" || panel.kind === "roster") return <ListPanel panel={panel} index={index} photoOf={photoOf} />;
  if (panel.kind === "profile") {
    const b = buildingOf(panel.login);
    return b ? <ProfilePanel index={index} b={b} /> : null;
  }
  if (panel.kind === "counter")
    return (
      <div data-panel={index} data-reel-box="counter" className="absolute text-center font-pixel uppercase text-white" style={{ left: "50%", transform: "translateX(-50%)", top: "15%", opacity: 0, ...outline(1.4) }}>
        <p className="text-lime" style={{ fontSize: "16cqw", lineHeight: 1 }}>
          <span data-n>1</span>
        </p>
        <p style={{ fontSize: "4.4cqw", lineHeight: 1, marginTop: "1.6cqw" }}>{panel.label}</p>
      </div>
    );
  const avatar = (login: string, size: number) => `https://avatars.githubusercontent.com/${login}?s=${size}`;
  if (panel.kind === "poster")
    return (
      <div
        data-panel={index}
        data-reel-box="poster"
        className="absolute font-pixel uppercase"
        style={{ left: "50%", top: "15%", width: "50cqw", opacity: 0, background: "#e8dcc8", color: "#2a1d12", border: "1.2cqw solid #2a1d12", boxShadow: "0 0 0 0.8cqw #e8dcc8", padding: "2.8cqw 2.6cqw 2.6cqw", textAlign: "center", transformOrigin: "50% 40%" }}
      >
        <p style={{ fontSize: "6cqw", lineHeight: 1 }}>{panel.title}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is */}
        <img alt="" src={avatar(panel.login, 300)} style={{ display: "block", width: "26cqw", height: "26cqw", margin: "2.2cqw auto", border: "0.8cqw solid #2a1d12", filter: "sepia(0.9) contrast(1.15)" }} />
        <p style={{ fontSize: "4.8cqw", lineHeight: 1, textTransform: "none" }}>{panel.login}</p>
        <p style={{ fontSize: "4.4cqw", lineHeight: 1, marginTop: "2.6cqw", padding: "1.4cqw 0", background: "#2a1d12", color: "#e8dcc8" }}>{panel.when}</p>
        <p style={{ fontSize: "3cqw", lineHeight: 1, marginTop: "1.6cqw" }}>{panel.where}</p>
      </div>
    );
  // The account's own Instagram profile, as the app draws it in dark mode.
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const plusOne = (n: string) => {
    const v = Number(n.replace(/\D/g, ""));
    return Number.isFinite(v) ? (v + 1).toLocaleString("pt-BR") : n;
  };
  return (
    <div
      data-panel={index}
      data-reel-box="follow"
      style={{ position: "absolute", left: "50%", top: "15%", width: "72cqw", transformOrigin: "50% 0", opacity: 0, background: "#000", color: "#f5f5f5", border: "0.3cqw solid #262626", borderRadius: "3cqw", padding: "4cqw", fontFamily: sans, boxShadow: "0 2cqw 6cqw rgba(0,0,0,0.6)" }}
    >
      <p style={{ fontSize: "4.6cqw", fontWeight: 700, lineHeight: 1 }}>{panel.handle}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "4cqw", marginTop: "3.4cqw" }}>
        <div style={{ width: "19cqw", height: "19cqw", borderRadius: "50%", background: "#5dd67a", overflow: "hidden", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the account's GitHub photo */}
          <img alt="" src={avatar(panel.avatar, 300)} style={{ display: "block", width: "100%", height: "100%" }} />
        </div>
        <div style={{ display: "flex", flex: 1, justifyContent: "space-between", textAlign: "center" }}>
          {(
            [
              [panel.posts, "posts", false],
              [panel.followers, "seguidores", true],
              [panel.following, "seguindo", false],
            ] as const
          ).map(([n, label, live]) => (
            <div key={label}>
              <p data-followers={live || undefined} data-before={live ? n : undefined} data-after={live ? plusOne(n) : undefined} style={{ fontSize: "4.2cqw", fontWeight: 700, lineHeight: 1 }}>
                {n}
              </p>
              <p style={{ fontSize: "2.8cqw", lineHeight: 1, marginTop: "1cqw" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: "3.2cqw", fontWeight: 600, marginTop: "3cqw", lineHeight: 1.2 }}>{panel.name}</p>
      <p style={{ fontSize: "3cqw", lineHeight: 1.35, marginTop: "0.8cqw" }}>
        {panel.bio.map((l, i) => (
          <span key={i} style={{ display: "block" }}>
            {l}
          </span>
        ))}
      </p>
      <p style={{ fontSize: "3cqw", fontWeight: 600, marginTop: "0.8cqw", color: "#e0f1ff" }}>🔗 {panel.link}</p>
      <div style={{ display: "flex", gap: "1.6cqw", marginTop: "3cqw" }}>
        <span data-follow style={{ flex: 1, textAlign: "center", padding: "2.2cqw 0", borderRadius: "2cqw", fontSize: "3.4cqw", fontWeight: 600, background: "#0095f6", color: "#fff" }}>
          Seguir
        </span>
        <span style={{ flex: 1, textAlign: "center", padding: "2.2cqw 0", borderRadius: "2cqw", fontSize: "3.4cqw", fontWeight: 600, background: "#262626", color: "#f5f5f5" }}>Mensagem</span>
      </div>
    </div>
  );
}

/** The list panels' markup: white outlined type and solid bars, no box (dark bands were rejected). */
function ListPanel({ panel, index, photoOf }: { panel: Extract<ReelPanel, { kind: "bars" | "roster" }>; index: number; photoOf: (login: string) => string | null }) {
  const type = "font-pixel uppercase text-white whitespace-nowrap";
  const max = panel.kind === "bars" ? Math.max(...panel.rows.map((r) => (typeof r.value === "number" ? r.value : Number(String(r.value).replace(/\D/g, "")) || 0)), 1) : 1;
  return (
    <div
      data-panel={index}
      data-reel-box={panel.kind}
      className="absolute flex flex-col"
      style={{ left: "50%", transform: "translateX(-50%)", top: "26%", width: "72%", gap: "1.2cqw", opacity: 0, ...outline(1.2) }}
    >
      {panel.title && (
        <p className={`${type} text-center`} style={{ fontSize: "4.2cqw", lineHeight: 1, marginBottom: "0.8cqw" }}>
          <Lit text={panel.title} />
        </p>
      )}
      {panel.kind === "bars"
        ? panel.rows.map((r, k) => {
            const v = typeof r.value === "number" ? r.value : Number(String(r.value).replace(/\D/g, "")) || 0;
            return (
              <div key={k} className="flex items-center" style={{ gap: "2cqw", height: "5.6cqw" }}>
                <span className={type} style={{ fontSize: "4.4cqw", width: "10cqw", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.label}
                </span>
                <div className="relative h-full flex-1">
                  <div
                    data-bar
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(v / max) * 100}%`, background: r.lit ? "var(--color-lime)" : "var(--color-cream)", transformOrigin: "0 50%", transform: "scaleX(0)", boxShadow: "0 0 0 0.5cqw #000" }}
                  />
                </div>
                <span className={type} style={{ fontSize: "4.4cqw", width: "12cqw", textAlign: "right", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {typeof r.value === "number" ? r.value.toLocaleString("pt-BR") : r.value}
                </span>
              </div>
            );
          })
        : panel.rows.map((r, n) => {
            const photo = photoOf(r.login);
            return (
              <div key={n} data-row={n} className="flex items-center" style={{ gap: "2.4cqw", height: "4.6cqw", display: "none" }}>
                <span className={type} style={{ fontSize: "4.4cqw", width: "9cqw", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.tag}
                </span>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" style={{ width: "4.6cqw", height: "4.6cqw", border: "0.5cqw solid #000", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: "4.6cqw", height: "4.6cqw", flexShrink: 0 }} />
                )}
                <span className={`${type} min-w-0 truncate`} style={{ fontSize: "4.4cqw", textTransform: "none", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.login}
                </span>
              </div>
            );
          })}
    </div>
  );
}

/** A silhouette with a "?" on its head: the balloon over an empty lot, the viewer's building to be. */
const GHOST_PIXELS: [number, number, number][] = [
  [3, 0, 4],
  [2, 1, 6],
  [2, 2, 6],
  [2, 3, 6],
  [3, 4, 4],
  [2, 6, 6],
  [1, 7, 8],
  [0, 8, 10],
  [0, 9, 10],
];

/** One balloon: a GitHub photo, a plate, or (an example with no plate) the "?" silhouette; then its office badges. */
function Balloon({ b, index, photoOf }: { b: ReelBalloon; index: number; photoOf: (login: string) => string | null }) {
  const photo = b.target !== "example" && !b.plate ? photoOf(b.target.login) : null;
  const ghost = b.target === "example" && !b.plate;
  return (
      <div data-balloon={index} data-reel-box="balloon" className="absolute font-pixel uppercase" style={{ opacity: 0, transform: "translate(-50%, -100%)", paddingBottom: "2.4cqw" }}>
        <div style={{ display: "grid", justifyItems: "center", alignItems: "end" }}>
          <div
            data-tag="plate"
            className="bg-bg text-cream"
            style={{
              gridArea: "1 / 1",
              border: `0.6cqw solid ${ghost ? "var(--color-lime)" : "var(--color-border)"}`,
              padding: photo ? "0.6cqw" : "1.6cqw 2.6cqw",
              fontSize: "4.6cqw",
              lineHeight: 1,
              textTransform: "none",
              whiteSpace: "nowrap",
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" style={{ width: "13cqw", height: "13cqw", display: "block", imageRendering: "pixelated" }} />
            ) : ghost ? (
              <svg viewBox="0 0 10 10" shapeRendering="crispEdges" style={{ width: "13cqw", height: "13cqw", display: "block" }}>
                {GHOST_PIXELS.map(([x, y, w]) => (
                  <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill="var(--color-lime-dark)" />
                ))}
                <text x="5" y="4.1" textAnchor="middle" fontFamily="Silkscreen, monospace" fontSize="3.6" fill="var(--color-bg)">
                  ?
                </text>
              </svg>
            ) : (
              (b.plate ?? "")
            )}
          </div>
          {b.badges.map((b, i) => {
            const look = BADGES[b.kind as BadgeKind];
            return (
              <div
                key={i}
                data-tag={String(i)}
                className="bg-bg"
                style={{
                  gridArea: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  gap: "2.2cqw",
                  border: `0.7cqw solid ${look.color}`,
                  padding: "2cqw 2.8cqw 2cqw 2.2cqw",
                  opacity: 0,
                  transformOrigin: "50% 100%",
                  whiteSpace: "nowrap",
                }}
              >
                <svg viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ width: "9cqw", height: "9cqw", flexShrink: 0 }}>
                  {look.pixels.map(([x, y, w, h]) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={look.color} />
                  ))}
                </svg>
                <div>
                  <p style={{ fontSize: "6.4cqw", lineHeight: 1, color: look.color }}>{look.title}</p>
                  <p className="text-muted" style={{ fontSize: "3cqw", lineHeight: 1, marginTop: "1.6cqw", textTransform: "none" }}>
                    {b.sub}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {/* The tail, pointing at the roof. */}
        <span
          className="absolute bg-border"
          style={{ left: "50%", transform: "translateX(-50%)", bottom: "0.4cqw", width: "2.6cqw", height: "2.2cqw", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
        />
      </div>
  );
}

export default function ReelOverlay({
  clock,
  reel,
  header,
  balloon,
  photoOf,
  buildingOf = () => null,
}: {
  clock: FilmClock;
  reel: Reel;
  header: ReelSpec["header"] | undefined;
  balloon: RefObject<HTMLDivElement | null>;
  /** A login's GitHub photo, for a balloon with no plate. */
  photoOf: (login: string) => string | null;
  /** A login's building, for its card (null where the world has no such building). */
  buildingOf?: (login: string) => CityBuilding | null;
}) {
  const line = useRef<HTMLParagraphElement>(null);
  const rule = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const draw = () => {
      const t = beatOf(clock);
      const i = reel.lines.findIndex((l) => t >= l.from && t < l.to);
      const el = line.current;
      if (el) {
        if (i !== shown) {
          shown = i;
          el.replaceChildren(
            ...(i < 0
              ? []
              : reel.lines[i].words.map((w) => {
                  const s = document.createElement("span");
                  s.textContent = w.text;
                  if (w.lit) s.style.color = "var(--color-lime)";
                  return s;
                })),
          );
        }
        if (i >= 0) {
          [...el.children].forEach((s, k) => {
            (s as HTMLElement).style.display = t >= reel.lines[i].words[k].at ? "" : "none";
          });
        }
        el.style.opacity = i < 0 ? "0" : "1";
      }
      const c = Math.min(1, Math.max(0, (t - reel.ctaAt) / FADE));
      if (rule.current) rule.current.style.opacity = String(1 - c);
      if (cta.current) cta.current.style.opacity = String(c);
      if (root.current) drawPanels(root.current, reel.panels, t);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [clock, reel]);

  const type = "absolute text-center font-pixel uppercase text-white whitespace-nowrap";
  const safe = { left: "50%", transform: "translateX(-50%)" } as const;

  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      {reel.panels.map((p, i) => (
        <Panel key={i} panel={p} index={i} photoOf={photoOf} buildingOf={buildingOf} />
      ))}
      {header && (
        <div className={type} style={{ ...safe, top: "15%", ...outline(1.4) }}>
          <div ref={rule} data-reel-box="header">
            <HeaderLines lines={header.rule} />
          </div>
          <div ref={cta} data-reel-box="header" className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity: 0 }}>
            <HeaderLines lines={header.cta} />
          </div>
        </div>
      )}

      <div ref={balloon}>
        {reel.balloons.map((b, i) => (
          <Balloon key={i} b={b} index={i} photoOf={photoOf} />
        ))}
      </div>

      <p
        ref={line}
        data-reel-box="captions"
        className={`${type} flex flex-wrap justify-center`}
        style={{ ...safe, top: "55%", width: "72%", whiteSpace: "normal", gap: "0 3cqw", fontSize: "7cqw", lineHeight: 1.3, opacity: 0, ...outline(1.8) }}
      />
    </div>
  );
}
