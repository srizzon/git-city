"use client";

import { Backdrop, Band } from "@/components/games/ui";
import { T } from "@/components/games/kit";
import { HUD_BOX } from "@/components/league/hud/shared";
import { useTouch } from "@/components/towns/useDesktop";
import { HEIST, type HeistView } from "@/lib/towns/heist";
import { useT } from "@/lib/i18n/LangProvider";
import { SIDE_COLOR } from "./kit";

// The city of the day while you drive (DriveHud's children, so it sits over
// the rest of the HUD). Top center, under nothing else the drive HUD puts
// there: a robber's haul (points not pushed yet), stars and hearts; a cop's
// city standing against the goal and their busts. Under it the push bar while
// you hold out outside the ring. Pushed and busted take the middle of the
// screen for a moment over the blurred road; a blue screen takes all of it.

const STAR = "#ffcf33";
const RED = "#ff5a52";
const COP = SIDE_COLOR.cop;
const EMPTY = "#2a2a30";
/** On a phone the top row is Pause and Games, and chat sits under Pause: the block goes right, under Games. */
const TOP_TOUCH = "right-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)]";

export default function HeistHud({ view }: { view: HeistView }) {
  const t = useT();
  const touch = useTouch();
  const { robber, cop, flash } = view;
  const push = robber?.push ?? null;

  if (flash?.kind === "bluescreen") return <BlueScreen by={flash.by} />;

  // One block, every row as wide as the panel.
  return (
    <>
      <div className={touch ? `absolute ${TOP_TOUCH}` : "absolute inset-x-0 top-4 flex justify-center"}>
        <div className="inline-flex flex-col items-stretch gap-1">
          {robber && (
            <div className={`${HUD_BOX} flex items-stretch divide-x-[3px] divide-border`}>
              <div className={`flex flex-1 items-baseline gap-2 ${touch ? "px-2.5 py-1.5" : "px-4 py-2"}`}>
                <span className={`${touch ? "text-lg" : "text-2xl"} leading-none tabular-nums text-lime`}>{robber.unpushed}</span>
                <span className={`${touch ? "text-[8px]" : "text-[9px]"} text-muted`}>{touch ? t("unpushed", "sem push") : t("pts not pushed", "pts sem push")}</span>
              </div>
              <div className={`flex items-center gap-0.5 ${touch ? "px-2" : "px-3"}`} aria-label={t(`${robber.stars} stars`, `${robber.stars} estrelas`)}>
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={`${touch ? "text-xs" : "text-lg"} leading-none`} style={{ color: i < robber.stars ? STAR : "#3a3a44" }} aria-hidden>
                    ★
                  </span>
                ))}
              </div>
              <div className={`flex items-center gap-1 ${touch ? "px-2" : "px-3"}`} aria-label={t(`${robber.hearts} of ${HEIST.hearts} hearts`, `${robber.hearts} de ${HEIST.hearts} vidas`)}>
                {Array.from({ length: HEIST.hearts }, (_, i) => (
                  <span key={i} className={touch ? "h-2 w-2" : "h-3 w-3"} style={{ background: i < robber.hearts ? RED : EMPTY }} aria-hidden />
                ))}
              </div>
            </div>
          )}

          {cop && (
            <div className={`${HUD_BOX} flex items-stretch divide-x-[3px] divide-border`} style={{ borderColor: COP }}>
              {!touch && (
                <div className="flex flex-col justify-center gap-1 px-4 py-2">
                  <span className="text-[8px]" style={{ color: COP }}>
                    {t("Defending", "Defendendo")}
                  </span>
                  <span className="text-sm leading-none">{view.city.name}</span>
                </div>
              )}
              <div className={`flex flex-1 flex-col justify-center gap-1.5 ${touch ? "px-2.5 py-1.5" : "px-3 py-2"}`}>
                <span className="text-[8px] text-muted">
                  {t("Standing", "De pé")} <span className="text-cream">{Math.round(view.city.standing * 100)}%</span> · {t("goal", "meta")} {Math.round(HEIST.standGoal * 100)}%
                </span>
                <span className="relative flex h-2 w-full min-w-[100px] bg-border" aria-hidden>
                  <span className="h-full" style={{ width: `${view.city.standing * 100}%`, background: COP }} />
                  <span className="absolute -top-[3px] h-[14px] w-[2px] bg-cream" style={{ left: `calc(${HEIST.standGoal * 100}% - 1px)` }} />
                </span>
              </div>
              <div className={`flex items-baseline gap-1.5 ${touch ? "px-2.5 py-1.5" : "px-4 py-2"}`}>
                <span className={`${touch ? "text-lg" : "text-2xl"} leading-none tabular-nums`}>{cop.busts}</span>
                <span className={`${touch ? "text-[8px]" : "text-[9px]"} text-muted`}>{cop.busts === 1 ? t("bust", "prisão") : t("busts", "prisões")}</span>
              </div>
            </div>
          )}

          {/* In the city with nothing knocked down yet: what to do. */}
        {robber?.inside && robber.unpushed === 0 && !push && (
          <Band animate={false} className={`w-full justify-center gap-2 normal-case text-cream ${touch ? "px-2.5 py-1.5" : "px-3 py-2"}`} style={{ fontSize: T.small }}>
            {t("Ram the buildings: every floor you knock off is points", "Bata nos prédios: cada andar derrubado vira ponto")}
          </Band>
        )}

        {push && (
            <Band tone={push.paused ? "red" : "dark"} tab={push.paused ? undefined : "#c8e64a"} animate={false} className={`w-full justify-between gap-3 ${touch ? "px-2.5 py-1.5" : "px-4 py-2"}`} style={{ fontSize: touch ? T.small : T.body }}>
              {push.paused ? t("Cop nearby", "Viatura perto") : <span className="text-lime">{t("Pushing", "Fazendo push")}</span>}
              <span className="flex flex-1 gap-[3px]" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className="h-3 flex-1" style={{ background: i < push.done * 10 ? (push.paused ? "#0d0d0f" : "#c8e64a") : push.paused ? "rgba(13,13,15,0.25)" : EMPTY }} />
                ))}
              </span>
              <span className="tabular-nums">{push.secsLeft}s</span>
            </Band>
          )}
          {push?.paused && !touch && (
            <Band animate={false} className="w-full justify-center px-3 py-1.5 normal-case text-muted" style={{ fontSize: T.small }}>
              {t("Lose it to keep going", "Despista ela pra continuar")}
            </Band>
          )}

          {cop?.target && (
            <Band tone="dark" tab={COP} animate={false} className={`w-full gap-2 ${touch ? "px-2.5 py-1.5" : "px-3 py-1.5"}`} style={{ fontSize: T.small }}>
              <span style={{ color: COP }}>{t("Magnet", "Ímã")}</span>
              <span className="truncate normal-case">@{cop.target}</span>
            </Band>
          )}
        </div>
      </div>

      {flash && (
        <div className="absolute inset-0">
          <Backdrop />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
            {flash.kind === "bust" ? (
              <>
                <Band className="px-6 py-3 leading-none text-bg" style={{ fontSize: T.hero, background: COP }}>
                  {t("Busted!", "Prendeu!")}
                </Band>
                <Band delay={90} className="px-5 py-2" style={{ fontSize: T.big }}>
                  <span className="text-lime">+{flash.pts}</span>&nbsp;pts
                </Band>
              </>
            ) : flash.kind === "pushed" ? (
              <>
                <Band tone="lime" className="px-6 py-3 leading-none" style={{ fontSize: T.hero }}>
                  {t("Pushed", "Push feito")}
                </Band>
                <Band delay={90} className="px-5 py-2" style={{ fontSize: T.big }}>
                  <span className="text-lime">+{flash.pts}</span>&nbsp;pts
                </Band>
              </>
            ) : (
              <>
                <Band tone="red" className="px-6 py-3 normal-case leading-none" style={{ fontSize: T.hero }}>
                  git reset --hard
                </Band>
                <Band delay={90} className="px-5 py-2" style={{ fontSize: T.big }}>
                  <span style={{ color: RED }}>−{flash.pts}</span>&nbsp;pts
                </Band>
                <Band delay={150} className="gap-2 px-4 py-1.5" style={{ fontSize: T.small }}>
                  <span className="text-muted">{t("Busted by", "Preso por")}</span>
                  {flash.by ? <span className="normal-case" style={{ color: COP }}>@{flash.by}</span> : <span style={{ color: COP }}>{t("the police", "pela polícia")}</span>}
                </Band>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** A cop's Tela azul on your screen: a Windows stop screen, 1.5 s. */
function BlueScreen({ by }: { by: string | null }) {
  const t = useT();
  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] flex flex-col justify-center gap-6 bg-[#0078d7] px-[10vw] font-sans normal-case text-white">
      <span className="text-[clamp(72px,12vw,140px)] font-light leading-none">:(</span>
      <p className="max-w-3xl text-[clamp(18px,2.6vw,30px)] font-light leading-snug">
        {t(
          "Your car ran into a problem and needs to be arrested. We're just collecting some info about the crime.",
          "Seu carro encontrou um problema e precisa ser preso. Estamos coletando algumas informações sobre o crime.",
        )}
      </p>
      <p className="text-[clamp(16px,1.8vw,22px)] font-light">{t("40% complete", "40% concluído")}</p>
      <p className="text-xs opacity-85">
        {t("Stop code", "Código de parada")}: TELA_AZUL_DA_POLICIA{by ? ` · ${t("sent by", "enviado por")} @${by}` : ""}
      </p>
    </div>
  );
}
