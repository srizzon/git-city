"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import type { CityBuilding } from "@/lib/github";
import { Avatar, fmt } from "@/components/league/hud/shared";
import { useSheet } from "@/components/league/hud/useSheet";
import TrophyIcon from "@/components/towns/TrophyIcon";
import { stateOf, type CityLayout } from "@/lib/towns/brasil-map";
import { formatLap } from "@/lib/league-city/race/laps";
import { type StateStats, type WeekStanding } from "./stats";

// A state's card, opened from its tag or a search: its place in the week's
// points race, its points, devs and newcomers, who runs it (its capital's
// founder, the week's governor, senator and its cities' mayors with their
// points), its cities biggest first, its biggest buildings, and the two ways
// to grow it: drive there, or invite someone.
// Number first, every number labeled in plain words.

export default function StateCard({
  state: s,
  byLogin,
  townPath,
  onPickDev,
  onPickCity,
  onDriveHere,
  onClose,
  week,
  cabinet,
  race,
  records,
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
  /** Last full week's crown and this week's leader, when either is this state. */
  week?: { crown: WeekStanding | null; leading: WeekStanding | null };
  /** The state's offices this week (brasil-roles): governor, senators, the mayors of its biggest cities. */
  cabinet?: { provisional: boolean; governor: string | null; senators: string[]; mayors: { city: string; login: string }[]; totals: Record<string, number> };
  /** Its place and points in this week's race (the States table's order). */
  race?: { place: number; points: number };
  /** Race records on routes starting in this state: the route's name, its holder and time. */
  records?: { route: string; login: string; ms: number }[];
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
  const founder = s.founder ? byLogin.get(s.founder.toLowerCase()) : null;

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

        {/* Who the state is: its flag, name, capital, and its place among the 27. */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-4 pr-12">
          <StateFlag uf={s.uf} className="h-8 w-11" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream">{s.name}</p>
            <p className="truncate text-[9px] normal-case text-muted">
              {s.uf} · {fmt(s.cities.filter((c) => c.devs.length > 0).length)} {s.cities.filter((c) => c.devs.length > 0).length === 1 ? "city" : "cities"} on the map
            </p>
          </div>
          {race && s.devs > 0 && (
            <span className="shrink-0 text-right">
              <span className="block border-2 border-lime px-1.5 py-0.5 text-xs text-lime">#{race.place}</span>
              <span className="mt-0.5 block text-[7px] text-muted">this week</span>
            </span>
          )}
        </div>

        {(week?.crown?.uf === s.uf || week?.leading?.uf === s.uf) && (
          <div className="mx-4 mb-3 flex items-center gap-2 bg-lime/10 px-2.5 py-1.5 text-[9px]">
            <TrophyIcon size={12} className="shrink-0 text-lime" />
            {week?.crown?.uf === s.uf ? (
              <span className="text-lime">
                State of the week <span className="normal-case text-muted">· +{fmt(week.crown.gained)} new devs</span>
              </span>
            ) : (
              <span className="text-lime">
                Most new devs <span className="normal-case text-muted">· +{fmt(week!.leading!.gained)} this week</span>
              </span>
            )}
          </div>
        )}

        <div className="mx-4 mb-4 grid grid-cols-3 gap-px border border-border/50 bg-border/30">
          {[
            { label: "Points this week", value: fmt(race?.points ?? 0) },
            { label: "Devs", value: fmt(s.devs) },
            { label: "New this week", value: `+${fmt(s.newThisWeek)}` },
          ].map((x) => (
            <div key={x.label} className="bg-bg-card px-1 py-2 text-center">
              <div className="truncate text-xs text-lime">{x.value}</div>
              <div className="mt-0.5 text-[8px] text-muted">{x.label}</div>
            </div>
          ))}
        </div>

        {/* Who runs it: the founder (forever) and this week's offices, one aligned list. */}
        <Section title={`Who runs ${s.uf}`} note={cabinet ? "changes Sunday 21h" : undefined}>
          <Row
            role="Founder"
            sub={s.capital.name}
            hot
            login={s.founder}
            avatar={founder?.avatar_url ?? null}
            value={s.founder ? "forever" : undefined}
            empty={`Nobody yet. The first dev founds ${s.capital.name}.`}
            onPick={onPickDev}
          />
          {cabinet && (
            <>
              <Row role="Governor" hot login={cabinet.governor} avatar={cabinet.governor ? (byLogin.get(cabinet.governor)?.avatar_url ?? null) : null} value={cabinet.governor ? `${fmt(cabinet.totals[cabinet.governor] ?? 0)} pts` : undefined} empty="Open: the most points takes it." onPick={onPickDev} />
              {cabinet.senators.map((l) => (
                <Row key={l} role="Senator" login={l} avatar={byLogin.get(l)?.avatar_url ?? null} value={`${fmt(cabinet.totals[l] ?? 0)} pts`} onPick={onPickDev} />
              ))}
              {cabinet.mayors.map((m) => (
                <Row key={m.city} role="Mayor" sub={m.city} login={m.login} avatar={byLogin.get(m.login)?.avatar_url ?? null} value={`${fmt(cabinet.totals[m.login] ?? 0)} pts`} onPick={onPickDev} />
              ))}
            </>
          )}
        </Section>

        {s.cities.some((c) => c.devs.length > 0) && (
          <Section title="Cities" note="devs">
            {s.cities
              .filter((c) => c.devs.length > 0)
              .slice(0, 6)
              .map((c) => {
                const f = c.devs.find((d) => d.founder)?.dev.login;
                return (
                  <li key={c.key}>
                    <button type="button" onClick={() => onPickCity(c)} className="flex w-full items-center gap-2.5 py-1 text-left hover:text-lime">
                      <span className="min-w-0 flex-1 truncate text-[10px] normal-case text-cream">{c.name}</span>
                      {f && <span className="min-w-0 max-w-[45%] truncate text-[8px] normal-case text-dim">founded by @{f}</span>}
                      <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-muted">{fmt(c.devs.length)}</span>
                    </button>
                  </li>
                );
              })}
          </Section>
        )}

        {records && records.length > 0 && (
          <Section title="Race records" note="from here">
            {records.slice(0, 5).map((r) => (
              <li key={r.route} className="flex items-center gap-2.5 py-1">
                <span className="min-w-0 flex-1 truncate text-[10px] normal-case text-cream">{r.route}</span>
                <button type="button" onClick={() => onPickDev(r.login)} className="min-w-0 max-w-[40%] truncate text-[8px] normal-case text-muted hover:text-lime">
                  @{r.login}
                </button>
                <span className="shrink-0 text-[9px] tabular-nums text-muted">{formatLap(r.ms)}</span>
              </li>
            ))}
          </Section>
        )}

        {s.top.length > 0 && (
          <Section title="Biggest buildings" note="commits, all time">
            {s.top.map((login, i) => {
              const b = byLogin.get(login.toLowerCase());
              return <Row key={login} role={`#${i + 1}`} login={login} avatar={b?.avatar_url ?? null} value={fmt(b?.contributions ?? 0)} onPick={onPickDev} />;
            })}
          </Section>
        )}

        <div className="mx-4 mb-4 flex flex-col gap-1.5">
          {onDriveHere && (
            <button type="button" onClick={onDriveHere} className="btn-press w-full border-2 border-lime bg-lime py-2 text-[10px] text-bg">
              Drive to {(s.cities.find((c) => c.devs.length > 0) ?? s.capital).name}
            </button>
          )}
          <button type="button" onClick={invite} className="btn-press w-full border-2 border-border py-2 text-[10px] text-cream hover:border-lime hover:text-lime">
            {copied ? "Invite copied" : `Invite to ${s.uf}`}
          </button>
          <p className="text-center text-[8px] normal-case text-muted">Tag a friend in a reel comment: +50 pts when they join.</p>
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
