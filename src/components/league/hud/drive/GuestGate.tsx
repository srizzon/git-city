"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import ArrivalChoice from "./ArrivalChoice";
import type { GateReason } from "@/lib/league-city/drive/guest-gate";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Lang } from "@/lib/i18n/lang";

// A guest gets pulled over (lib drive/guest-gate): the car stops on the same
// choice as the town's arrival, sign in with GitHub or drive on as a guest.
// Also right after the guest's free building fell (taste).

type Copy = Record<GateReason, { eyebrow: (town: string, login: string) => string; title: string; detail: string; driveLabel: string; driveDetail: string }>;

const DETAIL = "Your name over your car, and every floor you smash counts for the weekly prize.";
const DRIVE_DETAIL = "Buildings won't fall and wins won't count.";
const DETAIL_PT = "Seu nome em cima do carro, e cada andar que você derruba conta pro prêmio da semana.";
const DRIVE_DETAIL_PT = "Os prédios não caem e as vitórias não contam.";

const COPY: Record<Lang, Copy> = {
  en: {
    start: { eyebrow: (town) => `Welcome to ${town}`, title: "Drive as yourself", detail: DETAIL, driveLabel: "Drive as guest", driveDetail: DRIVE_DETAIL },
    time: { eyebrow: () => "Driving as a guest", title: "Sign in so it counts", detail: DETAIL, driveLabel: "Keep driving as guest", driveDetail: DRIVE_DETAIL },
    crown: { eyebrow: () => "You won the crown rush", title: "Sign in to keep the win", detail: DETAIL, driveLabel: "Keep driving as guest", driveDetail: DRIVE_DETAIL },
    // The free building fell on your screen only: sign in and knock it down for real.
    taste: {
      eyebrow: (_town, login) => `@${login}'s building is down`,
      title: "Plant your flag here",
      detail: "Sign in and knock it down for real. Your flag goes on the rubble and the floors count.",
      driveLabel: "Later",
      driveDetail: "Only you saw it fall. The rest stay standing.",
    },
  },
  pt: {
    start: { eyebrow: (town) => `Bem-vindo a ${town}`, title: "Dirija com seu nome", detail: DETAIL_PT, driveLabel: "Dirigir como visitante", driveDetail: DRIVE_DETAIL_PT },
    time: { eyebrow: () => "Dirigindo como visitante", title: "Entre pra valer", detail: DETAIL_PT, driveLabel: "Seguir como visitante", driveDetail: DRIVE_DETAIL_PT },
    crown: { eyebrow: () => "Você ganhou a corrida da coroa", title: "Entre pra guardar a vitória", detail: DETAIL_PT, driveLabel: "Seguir como visitante", driveDetail: DRIVE_DETAIL_PT },
    taste: {
      eyebrow: (_town, login) => `O prédio de @${login} caiu`,
      title: "Finque sua bandeira aqui",
      detail: "Entre e derrube de verdade. Sua bandeira fica nos escombros e os andares contam.",
      driveLabel: "Depois",
      driveDetail: "Só você viu cair. O resto continua de pé.",
    },
  },
};

export default function GuestGate({
  reason,
  town,
  login = "",
  onSignIn,
  onContinue,
}: {
  reason: GateReason;
  /** The town's display name. */
  town: string;
  /** taste: whose building fell. */
  login?: string;
  onSignIn: () => void;
  onContinue: () => void;
}) {
  const { lang, t } = useLang();
  const copy = COPY[lang][reason];
  useEffect(() => {
    posthog.capture("guest_gate_shown", { reason, town });
  }, [reason, town]);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 font-pixel uppercase">
      <ArrivalChoice
        eyebrow={copy.eyebrow(town, login)}
        title={copy.title}
        label={t("Sign in with GitHub", "Entrar com GitHub")}
        detail={copy.detail}
        busyLabel={t("Opening GitHub...", "Abrindo o GitHub...")}
        driveLabel={copy.driveLabel}
        driveDetail={copy.driveDetail}
        onJoin={() => {
          posthog.capture("signin_clicked", { where: `gate_${reason}`, town });
          onSignIn();
        }}
        onDrive={() => {
          posthog.capture("guest_gate_dismissed", { reason, town });
          onContinue();
        }}
      />
    </div>
  );
}
