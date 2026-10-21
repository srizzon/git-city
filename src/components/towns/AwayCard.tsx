"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { HUD_BOX } from "@/components/league/hud/shared";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Lang } from "@/lib/i18n/lang";
import type { AwayFall, AwayResponse } from "@/app/api/towns/away/route";

// While you were away: who knocked your buildings down since you last looked,
// in the corner like the town's first steps, with one button to hit the last
// one back (the car next to their building, as in the email). What you saw is
// kept in this browser; a first visit counts the last 3 days.

const SEEN_KEY = "gc-away-seen";
const FIRST_LOOK_MS = 3 * 86_400_000;
const SHIELD_MS = 12 * 3_600_000;

function readSeen(): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    // storage blocked: count from the last 3 days
  }
  return Date.now() - FIRST_LOOK_MS;
}

function saveSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // storage blocked: the box comes back next visit
  }
}

function ago(ms: number, lang: Lang): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  const h = Math.round(m / 60);
  const span = m < 60 ? `${m}m` : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
  return lang === "pt" ? `há ${span}` : `${span} ago`;
}

export default function AwayCard({ signedIn }: { signedIn: boolean }) {
  const { lang, t } = useLang();
  const [news, setNews] = useState<{ falls: AwayFall[]; hitBack: AwayResponse["hitBack"]; at: number } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const seen = readSeen();
    fetch("/api/towns/away")
      .then((r) => (r.ok ? (r.json() as Promise<AwayResponse>) : null))
      .then((d) => {
        if (!live || !d) return;
        const falls = d.falls.filter((f) => Date.parse(f.fellAt) > seen);
        if (falls.length === 0) return;
        setNews({ falls, hitBack: d.hitBack, at: Date.now() });
        posthog.capture("away_card_shown", { falls: falls.length, hit_back: !!d.hitBack });
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [signedIn]);

  if (!news) return null;
  const last = news.falls[0];
  const others = new Set(news.falls.map((f) => f.attacker.toLowerCase())).size - 1;
  const since = news.at - Date.parse(last.fellAt);
  const shieldH = Math.ceil((SHIELD_MS - since) / 3_600_000);
  const close = () => {
    saveSeen();
    setNews(null);
  };

  return (
    <section className={`${HUD_BOX} w-full px-4 py-3 font-pixel uppercase sm:w-[300px]`} style={{ animation: "slide-up 0.4s ease-out both" }}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-cream">{t("While you were away", "Enquanto você tava fora")}</span>
        <button type="button" onClick={close} aria-label={t("Hide", "Esconder")} className="px-1 text-muted transition-colors hover:text-cream">
          ✕
        </button>
      </div>
      <p className="mt-2.5 text-[11px] normal-case leading-relaxed text-cream">
        <span className="text-lime">@{last.attacker}</span>
        {lang === "pt"
          ? `${others > 0 ? ` e mais ${others}` : ""} ${others > 0 ? "derrubaram" : "derrubou"} seu prédio em ${last.town} · ${ago(since, lang)}`
          : `${others > 0 ? ` and ${others} other${others === 1 ? "" : "s"}` : ""} knocked your building down in ${last.town} · ${ago(since, lang)}`}
      </p>
      {shieldH > 0 && <p className="mt-1 text-[10px] normal-case text-muted">{t(`Shielded for ${shieldH}h`, `Protegido por ${shieldH}h`)}</p>}
      {news.hitBack && (
        <a
          href={`/town/${news.hitBack.slug}?drive=1&at=${encodeURIComponent(news.hitBack.login)}`}
          onClick={() => {
            saveSeen();
            posthog.capture("away_smash_back_clicked", { town: news.hitBack?.slug });
          }}
          className="btn-press mt-3 inline-block bg-lime px-2.5 py-1 text-[10px] uppercase tracking-wider text-bg"
        >
          {t("Smash back", "Revidar")}
        </a>
      )}
    </section>
  );
}
