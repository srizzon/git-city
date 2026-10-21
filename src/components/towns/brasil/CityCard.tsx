"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import type { CityBuilding } from "@/lib/github";
import { fmt } from "@/components/league/hud/shared";
import { useSheet } from "@/components/league/hud/useSheet";
import { stateOf, type CityLayout, type UF } from "@/lib/towns/brasil-map";
import { useT } from "@/lib/i18n/LangProvider";
import { Row, Section, StateFlag } from "./StateCard";

// A city's card, opened from its tag, a link (?cidade=) or a state's list,
// the same card as a state's one level down: its state (a tap away), how many
// devs live there and how many came this week, who runs it (its founder, the
// week's mayor), its biggest buildings, and the two ways to grow it: drive
// there, or invite someone. Capitals open their state's card instead.

const WEEK_MS = 7 * 86_400_000;

export default function CityCard({
  city: c,
  byLogin,
  townPath,
  mayor,
  totals,
  place,
  now,
  onPickDev,
  onState,
  onDriveHere,
  onClose,
}: {
  city: CityLayout;
  byLogin: ReadonlyMap<string, CityBuilding>;
  /** The town's path, for the invite link. */
  townPath: string;
  /** This week's mayor (most points in the city), or null. */
  mayor: string | null;
  /** This week's points by login, for the mayor's line. */
  totals: Record<string, number>;
  /** Its place among its state's cities by devs (1-based), or null on the island. */
  place: number | null;
  now: number;
  onPickDev: (login: string) => void;
  /** Open its state's card. */
  onState: (uf: UF) => void;
  onDriveHere?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const sheet = useSheet(onClose);
  const { close } = sheet;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const founder = c.devs.find((d) => d.founder)?.dev.login ?? null;
  const newThisWeek = c.devs.filter((d) => now - d.at < WEEK_MS).length;
  const commits = c.devs.reduce((n, d) => n + (byLogin.get(d.dev.login.toLowerCase())?.contributions ?? 0), 0);
  const top = [...c.devs]
    .map((d) => d.dev.login)
    .sort((a, b) => (byLogin.get(b.toLowerCase())?.contributions ?? 0) - (byLogin.get(a.toLowerCase())?.contributions ?? 0))
    .slice(0, 8);
  const state = c.uf ? stateOf(c.uf) : null;

  const invite = () => {
    const url = `${window.location.origin}${townPath}${c.slug ? `?cidade=${c.slug}` : ""}`;
    // Shared by Brazilians to Brazilians: Portuguese, one line.
    const text = c.devs.length === 0 ? `${c.name} ainda não tem ninguém no mapa dos devs. Bora fundar? ${url}` : `${c.name} tem ${c.devs.length} ${c.devs.length === 1 ? "dev" : "devs"} no mapa dos devs. Vem morar aqui: ${url}`;
    posthog.capture("brasil_invite_copied", { city: c.ibge, from: "city_card" });
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2">
      <div
        role="dialog"
        aria-label={c.name}
        className={`${sheet.className} relative max-h-[60vh] w-full overflow-y-auto border-t-[3px] border-border bg-bg-raised/95 font-pixel uppercase text-warm backdrop-blur-sm sm:max-h-[85vh] sm:w-[340px] sm:border-[3px]`}
      >
        <button type="button" onClick={close} className="absolute right-3 top-2 z-10 text-[10px] text-muted transition-colors hover:text-cream">
          ESC
        </button>

        {/* Who the city is: its state's flag, its name, its state (a tap away), its place in it. */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-4 pr-12">
          {c.uf ? <StateFlag uf={c.uf} className="h-8 w-11" /> : <span className="h-8 w-11 shrink-0 border-2 border-border-light bg-lime/30" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm normal-case text-cream">{c.ibge === null ? t("Island", "Ilha") : c.name}</p>
            {state && c.uf ? (
              <button type="button" onClick={() => onState(c.uf!)} className="truncate text-[9px] normal-case text-muted underline decoration-border-light underline-offset-2 hover:text-lime">
                {state.name} · {c.uf}
              </button>
            ) : (
              <p className="text-[9px] normal-case text-muted">{t("For devs who didn't name a state", "Pra quem não disse o estado")}</p>
            )}
          </div>
          {place && c.devs.length > 0 && (
            <span className="shrink-0 text-right">
              <span className="block border-2 border-lime px-1.5 py-0.5 text-xs text-lime">#{place}</span>
              <span className="mt-0.5 block text-[7px] text-muted">{t("in", "em")} {c.uf}</span>
            </span>
          )}
        </div>

        <div className="mx-4 mb-4 grid grid-cols-3 gap-px border border-border/50 bg-border/30">
          {[
            { label: "Devs", value: fmt(c.devs.length) },
            { label: t("New this week", "Novos na semana"), value: `+${fmt(newThisWeek)}` },
            { label: "Commits", value: fmt(commits) },
          ].map((x) => (
            <div key={x.label} className="bg-bg-card px-1 py-2 text-center">
              <div className="truncate text-xs text-lime">{x.value}</div>
              <div className="mt-0.5 text-[8px] text-muted">{x.label}</div>
            </div>
          ))}
        </div>

        {c.ibge !== null && (
          <Section title={t(`Who runs ${c.name}`, `Quem manda em ${c.name}`)} note={t("mayor changes Sunday 21h", "prefeito muda domingo 21h")}>
            <Row role={t("Founder", "Fundador")} hot login={founder} avatar={founder ? (byLogin.get(founder.toLowerCase())?.avatar_url ?? null) : null} value={founder ? t("forever", "pra sempre") : undefined} empty={t(`Nobody yet. The first dev founds ${c.name}.`, `Ninguém ainda. O primeiro dev funda ${c.name}.`)} onPick={onPickDev} />
            <Row role={t("Mayor", "Prefeito")} hot login={mayor} avatar={mayor ? (byLogin.get(mayor.toLowerCase())?.avatar_url ?? null) : null} value={mayor ? `${fmt(totals[mayor.toLowerCase()] ?? 0)} pts` : undefined} empty={t("Open: the most points here takes it.", "Vago: quem fizer mais pontos aqui leva.")} onPick={onPickDev} />
          </Section>
        )}

        {top.length > 0 && (
          <Section title={t("Biggest buildings", "Maiores prédios")} note={t("commits, all time", "commits, desde sempre")}>
            {top.map((login, i) => {
              const b = byLogin.get(login.toLowerCase());
              return <Row key={login} role={`#${i + 1}`} login={login} avatar={b?.avatar_url ?? null} value={fmt(b?.contributions ?? 0)} onPick={onPickDev} />;
            })}
          </Section>
        )}

        <div className="mx-4 mb-4 flex flex-col gap-1.5">
          {onDriveHere && c.devs.length > 0 && (
            <button type="button" onClick={onDriveHere} className="btn-press w-full border-2 border-lime bg-lime py-2 text-[10px] text-bg">
              {t("Drive in", "Dirigir em")} {c.ibge === null ? t("the island", "a ilha") : c.name}
            </button>
          )}
          <button type="button" onClick={invite} className="btn-press w-full border-2 border-border py-2 text-[10px] text-cream hover:border-lime hover:text-lime">
            {copied ? t("Invite copied", "Convite copiado") : t(`Invite to ${c.ibge === null ? "the island" : c.name}`, `Convidar pra ${c.ibge === null ? "a ilha" : c.name}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
