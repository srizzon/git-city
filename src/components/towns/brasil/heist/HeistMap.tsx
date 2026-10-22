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
export function HeistStrip({ city, side, resident, onGo }: { city: HeistCity; side: HeistSide | null; resident: boolean; onGo: () => void }) {
  const t = useT();
  const mine = resident ? "cop" : side;
  return (
    <button
      type="button"
      onClick={onGo}
      className="pointer-events-auto flex h-10 w-full items-center gap-2 bg-[#141417] px-3 text-left font-pixel text-[10px] uppercase shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-colors hover:bg-[#1c1c20] sm:text-[11px]"
    >
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-red-500" aria-hidden />
      <span className="shrink-0 text-lime">{t("City of the day", "Cidade do dia")}</span>
      <span className="truncate normal-case text-cream">{city.name}</span>
      <span className="ml-auto shrink-0" style={{ color: mine === "cop" ? COP : mine === "robber" ? ROBBER : undefined }}>
        {resident ? (
          t("You defend it", "Você defende")
        ) : mine === "cop" ? (
          t("Cop today", "Polícia hoje")
        ) : mine === "robber" ? (
          t("Robber today", "Ladrão hoje")
        ) : (
          <span className="text-muted">{t(`${HEIST.building} a building`, `${HEIST.building} por prédio`)}</span>
        )}
      </span>
      <ChevronRight size={14} className="shrink-0 text-lime" aria-hidden />
    </button>
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
