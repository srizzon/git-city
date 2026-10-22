"use client";

import { ChevronRight, X } from "lucide-react";
import { Backdrop, Band } from "@/components/games/ui";
import { T } from "@/components/games/kit";
import { HEIST, defended, type HeistCity, type HeistResult, type HeistSide } from "@/lib/towns/heist";
import { useT } from "@/lib/i18n/LangProvider";
import { SIDE_COLOR } from "./kit";

// The city of the day off the car. On the map, a row riding on the bar (a
// live race's invite takes over while one is open): the city, what it pays or
// your side for the day; a tap drives there. At the ring, a driver
// who never picked gets the two sides as equal cards (neither is the
// default). The morning after, yesterday's result once, as a timing tower.

const ROBBER = "#ff5a52";
const COP = SIDE_COLOR.cop;

/** On the map: one row on top of the bar. A tap drives there; the side is picked at the ring. */
/**
 * On the map: one block on top of the bar, in the HUD's dark with a 3px edge.
 * It says what's going on in words a first-timer gets (a fight over a city,
 * double points for knocking buildings down there) and asks for a side right
 * there; once you have one (or live there, a cop already), one button goes.
 */
export function HeistStrip({ city, side, resident, onPick }: { city: HeistCity; side: HeistSide | null; resident: boolean; onPick: (side: HeistSide) => void }) {
  const t = useT();
  const mine: HeistSide | null = resident ? "cop" : side;
  const title = resident
    ? t(`${city.name} is yours: defend it`, `${city.name} é sua: defenda`)
    : mine === "robber"
      ? t(`${city.name}: you're a robber today`, `${city.name}: você é ladrão hoje`)
      : mine === "cop"
        ? t(`${city.name}: you're a cop today`, `${city.name}: você é polícia hoje`)
        : t(`${city.name}: smash or defend`, `${city.name}: derrube ou defenda`);
  const line =
    mine === "robber"
      ? t("Smash, then leave the city to keep the points", "Derrube e saia da cidade pra garantir")
      : mine === "cop"
        ? t("Bust whoever smashes here, points each", "Prenda quem derruba aqui, pontos por prisão")
        : t("A building knocked down here pays double points", "Prédio derrubado aqui vale pontos em dobro");
  const btn = "flex h-9 items-center justify-center gap-1.5 border-[3px] px-3 text-[10px] transition-colors active:translate-y-px sm:text-[11px]";
  return (
    // No side yet: the two sides under the words, full width. A side: one button on the right.
    <div className={`pointer-events-auto flex w-full gap-3 border-[3px] border-border bg-bg-raised px-3 py-2.5 font-pixel uppercase sm:px-4 ${mine ? "items-center" : "flex-col items-stretch gap-2.5"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[8px] tracking-widest text-muted sm:text-[9px]">
          <span className="h-1.5 w-1.5 animate-pulse bg-red-500" aria-hidden />
          {t("City of the day · until midnight", "Cidade do dia · até meia-noite")}
        </span>
        <span className="text-[12px] leading-tight text-cream sm:text-sm">{title}</span>
        <span className="text-[9px] normal-case leading-snug text-muted sm:text-[10px]">{line}</span>
      </div>
      {mine ? (
        <button type="button" onClick={() => onPick(mine)} className={`${btn} shrink-0 text-bg hover:brightness-110`} style={{ background: mine === "cop" ? COP : ROBBER, borderColor: mine === "cop" ? COP : ROBBER }}>
          {mine === "cop" && resident ? t("Defend", "Defender") : t("Go", "Ir")}
          <ChevronRight size={14} strokeWidth={3} aria-hidden />
        </button>
      ) : (
        <div className="grid shrink-0 grid-cols-2 gap-1.5">
          <button type="button" onClick={() => onPick("robber")} className={`${btn} hover:bg-[#ff5a52]/15`} style={{ borderColor: ROBBER, color: ROBBER }}>
            {t("Smash", "Derrubar")}
          </button>
          <button type="button" onClick={() => onPick("cop")} className={`${btn} hover:bg-[#5aa0ff]/15`} style={{ borderColor: COP, color: COP }}>
            {t("Defend", "Defender")}
          </button>
        </div>
      )}
    </div>
  );
}

/** At the ring with no side yet: the car waits on this. */
export function SideChoice({ city, onPick }: { city: HeistCity; onPick: (side: HeistSide) => void }) {
  const t = useT();
  const card = "btn-press flex flex-col gap-3 border-[3px] bg-bg-card p-4 text-left sm:p-6";
  return (
    <div role="dialog" aria-label={t("Pick a side", "Escolha um lado")} className="pointer-events-auto absolute inset-0 flex animate-[fade-in_0.3s_ease-out_both] items-center justify-center bg-bg/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-[10px] tracking-widest text-lime sm:text-xs">
            {t("City of the day", "Cidade do dia")} · {city.name}
          </p>
          <h2 className="text-xl leading-snug text-cream sm:text-3xl">{t("Which side are you on today?", "De que lado você tá hoje?")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <button type="button" onClick={() => onPick("robber")} className={card} style={{ borderColor: ROBBER }}>
            <span className="text-sm tracking-widest sm:text-base" style={{ color: ROBBER }}>
              {t("Robber", "Ladrão")}
            </span>
            <span className="text-[11px] leading-relaxed normal-case text-muted sm:text-xs">
              {t(`Knock buildings down, ${HEIST.building} each. Leave the city to push them.`, `Derrube prédios, ${HEIST.building} cada. Saia da cidade pra fazer o push.`)}
            </span>
            <span className="mt-auto self-start border-2 border-border px-1.5 py-0.5 text-[9px] text-muted max-sm:hidden">1</span>
          </button>
          <button type="button" onClick={() => onPick("cop")} className={card} style={{ borderColor: COP }}>
            <span className="text-sm tracking-widest sm:text-base" style={{ color: COP }}>
              {t("Cop", "Polícia")}
            </span>
            <span className="text-[11px] leading-relaxed normal-case text-muted sm:text-xs">
              {t(`Bust whoever smashes, ${HEIST.bust} a bust.`, `Prenda quem derruba, ${HEIST.bust} por prisão.`)}
            </span>
            <span className="mt-auto self-start border-2 border-border px-1.5 py-0.5 text-[9px] text-muted max-sm:hidden">2</span>
          </button>
        </div>
        <p className="text-center text-[10px] normal-case text-muted">{t("Your side holds until midnight.", "Vale até meia-noite.")}</p>
      </div>
    </div>
  );
}

/** Yesterday's city, the first time you open the map today. */
export function HeistResultTower({ result, onClose }: { result: HeistResult; onClose: () => void }) {
  const t = useT();
  const held = defended(result.standing);
  const row = "w-full justify-between px-4 py-2.5";
  return (
    <div className="pointer-events-auto fixed inset-0 z-40">
      <div className="absolute inset-0" onClick={onClose} aria-hidden>
        <Backdrop />
      </div>
      <div role="dialog" aria-label={t("Yesterday's city", "Cidade de ontem")} className="absolute left-1/2 top-1/2 flex w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-1">
        <button type="button" onClick={onClose} className="text-left outline-none active:translate-y-px">
          <Band tab={held ? COP : ROBBER} className={`${row} py-2`} style={{ fontSize: T.small }}>
            <span style={{ color: held ? COP : ROBBER }}>
              {t("Yesterday", "Ontem")} · {result.city.name}
            </span>
            <span className="flex items-center gap-1 text-muted">
              {t("Close", "Fechar")} <X size={12} aria-hidden />
            </span>
          </Band>
        </button>
        <Band delay={40} className={`${row} py-3 leading-none`} style={{ fontSize: T.hero, background: held ? COP : ROBBER, color: "#0d0d0f" }}>
          {Math.round(result.standing * 100)}%
          <span style={{ fontSize: T.small }}>{held ? t("Defended", "Defendida") : t("Robbed", "Saqueada")}</span>
        </Band>
        {result.cops.slice(0, 2).map((c, i) => (
          <Band key={c.login} delay={80 + i * 40} className={row} style={{ fontSize: T.body }}>
            <span className="normal-case">@{c.login}</span>
            <span style={{ color: COP }}>
              {c.busts} {t("busts", "prisões")}
            </span>
          </Band>
        ))}
        {result.robbers.slice(0, 1).map((r) => (
          <Band key={r.login} delay={160} className={row} style={{ fontSize: T.body }}>
            <span className="normal-case">@{r.login}</span>
            <span style={{ color: ROBBER }}>
              {r.pts} {t("pts pushed", "pts com push")}
            </span>
          </Band>
        ))}
        {result.you && (
          <Band tone="lime" delay={200} className={row} style={{ fontSize: T.body }}>
            <span>
              {t("You", "Você")}:{" "}
              {result.you.side === "cop" ? `${result.you.busts ?? 0} ${t("busts", "prisões")}` : `${result.you.pts ?? 0} ${t("pts pushed", "pts com push")}`}
            </span>
            {result.you.bonus ? <span>+{result.you.bonus} {t("bonus", "bônus")}</span> : null}
          </Band>
        )}
      </div>
    </div>
  );
}
