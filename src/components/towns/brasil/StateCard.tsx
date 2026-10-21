"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import type { CityBuilding } from "@/lib/github";
import { Avatar, fmt } from "@/components/league/hud/shared";
import { useSheet } from "@/components/league/hud/useSheet";
import { stateOf, type CityLayout } from "@/lib/towns/brasil-map";
import { type StateStats } from "./stats";

// A state's card, opened from its tag or a search: its place and points in the
// week's race, who runs it (this week's governor and its founder), its three
// biggest cities, and the two ways to grow it: drive there, or invite someone.

export default function StateCard({
  state: s,
  byLogin,
  townPath,
  onPickDev,
  onPickCity,
  onDriveHere,
  onClose,
  race,
  governor,
  governorPoints,
}: {
  state: StateStats;
  byLogin: ReadonlyMap<string, CityBuilding>;
  /** The town's path, for the invite link. */
  townPath: string;
  onPickDev: (login: string) => void;
  /** Fly to one of its cities. */
  onPickCity: (c: CityLayout) => void;
  onDriveHere?: () => void;
  onClose: () => void;
  /** Its place and points in this week's race (the States table's order). */
  race?: { place: number; points: number };
  /** This week's governor (the most points in the state), if any. */
  governor?: string | null;
  /** This week's points by login. */
  governorPoints?: Record<string, number>;
}) {
  const sheet = useSheet(onClose);
  const { close } = sheet;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const invite = () => {
    const url = `${window.location.origin}${townPath}?uf=${s.uf}`;
    // Shared by Brazilians to Brazilians: Portuguese, one line, a nudge for the state.
    const text = s.devs === 0 ? `${s.name} ainda não tem ninguém no mapa dos devs. Bora fundar? ${url}` : `${s.name} tá em #${s.place} no mapa dos devs. Bora subir? ${url}`;
    posthog.capture("brasil_invite_copied", { uf: s.uf, from: "state_card" });
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  const avatar = (login: string | null | undefined) => (login ? (byLogin.get(login.toLowerCase())?.avatar_url ?? null) : null);
  const cities = s.cities.filter((c) => c.devs.length > 0);

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2">
      <div
        role="dialog"
        aria-label={s.name}
        className={`${sheet.className} relative max-h-[60vh] w-full overflow-y-auto border-t-[3px] border-border bg-bg-raised/95 font-pixel uppercase text-warm backdrop-blur-sm sm:max-h-[85vh] sm:w-[340px] sm:border-[3px]`}
      >
        <button type="button" onClick={close} className="absolute right-3 top-2 z-10 text-[10px] text-muted transition-colors hover:text-cream">
          ESC
        </button>

        {/* Who the state is, and where it stands this week. */}
        <div className="flex items-center gap-3 px-4 pb-4 pt-4 pr-12">
          <StateFlag uf={s.uf} className="h-8 w-11" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream">{s.name}</p>
            <p className="mt-1 truncate text-[9px] normal-case text-muted">
              {race && s.devs > 0 && (
                <>
                  <span className="text-lime">#{race.place}</span> this week · {fmt(race.points)} pts ·{" "}
                </>
              )}
              {fmt(s.devs)} {s.devs === 1 ? "dev" : "devs"}
            </p>
          </div>
        </div>

        <Section title={`Who runs ${s.uf}`}>
          {governor !== undefined && (
            <Row role="Governor" hot login={governor} avatar={avatar(governor)} value={governor ? `${fmt(governorPoints?.[governor] ?? 0)} pts` : undefined} empty="Open: the most points takes it." onPick={onPickDev} />
          )}
          <Row role="Founder" login={s.founder} avatar={avatar(s.founder)} value={s.founder ? s.capital.name : undefined} empty={`Nobody yet. The first dev founds ${s.capital.name}.`} onPick={onPickDev} />
        </Section>

        {cities.length > 0 && (
          <Section title="Cities" note="devs">
            {cities.slice(0, 3).map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => onPickCity(c)} className="flex w-full items-center gap-2.5 py-1 text-left hover:text-lime">
                  <span className="min-w-0 flex-1 truncate text-[10px] normal-case text-cream">{c.name}</span>
                  <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-muted">{fmt(c.devs.length)}</span>
                </button>
              </li>
            ))}
          </Section>
        )}

        <div className="mx-4 mb-4 flex flex-col items-center gap-2">
          {onDriveHere && (
            <button type="button" onClick={onDriveHere} className="btn-press w-full border-2 border-lime bg-lime py-2 text-[10px] text-bg">
              Drive to {(cities[0] ?? s.capital).name}
            </button>
          )}
          <button type="button" onClick={invite} className="text-[9px] normal-case text-muted transition-colors hover:text-lime">
            {copied ? "Invite copied" : `Invite to ${s.uf}`}
          </button>
          <p className="text-center text-[8px] normal-case text-dim">Tag a friend in a reel comment: +50 pts when they join.</p>
        </div>
      </div>
    </div>
  );
}

/** A state's flag as stripes of its colors (a black-only swatch read as a hole). */
export function StateFlag({ uf, className = "" }: { uf: StateStats["uf"]; className?: string }) {
  const colors = stateOf(uf).colors;
  return (
    <span className={`flex shrink-0 flex-col border-2 border-border-light ${className}`} aria-hidden>
      {colors.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mx-4 mb-4">
      <p className="mb-1 flex items-baseline justify-between border-b border-border pb-1 text-[8px] text-muted">
        <span className="text-cream-dark">{title}</span>
        {note && <span>{note}</span>}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

/** One aligned line: the role, the dev's face and @, a number on the right. */
export function Row({
  role,
  sub,
  hot = false,
  login,
  avatar,
  value,
  empty,
  onPick,
}: {
  role: string;
  sub?: string;
  hot?: boolean;
  login: string | null;
  avatar: string | null;
  value?: string;
  empty?: string;
  onPick: (login: string) => void;
}) {
  const label = (
    <span className={`w-[64px] shrink-0 truncate text-[8px] ${hot ? "text-lime" : "text-muted"}`}>
      {role}
      {sub && <span className="block truncate normal-case text-dim">{sub}</span>}
    </span>
  );
  if (!login)
    return (
      <li className="flex items-center gap-2.5 py-1.5">
        {label}
        <span className="text-[9px] normal-case text-dim">{empty}</span>
      </li>
    );
  return (
    <li>
      <button type="button" onClick={() => onPick(login)} className="flex w-full items-center gap-2.5 py-1 text-left hover:text-lime">
        {label}
        <Avatar src={avatar} size={20} />
        <span className="min-w-0 flex-1 truncate text-[10px] normal-case text-cream">@{login}</span>
        {value && <span className="shrink-0 text-[9px] text-muted">{value}</span>}
      </button>
    </li>
  );
}
