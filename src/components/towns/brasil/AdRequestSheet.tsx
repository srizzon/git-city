"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import posthog from "posthog-js";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Lang } from "@/lib/i18n/lang";
import { Overlay } from "./projects-ui";
import { ADVERTISER_KINDS, BUDGETS, advertiserLabel, budgetLabel, projectWeek, type AdvertiserKind, type Budget } from "@/lib/towns/brasil-projects";

// The ad slot's request form: what to promote, the link, an email, who they
// are, which weeks, and what they'd pay for a week at #1. It only emails the
// request; nothing is booked or charged here, and the page promises neither a
// price nor a date.

const input = "w-full border-2 border-border bg-bg px-3 py-2 font-sans text-[13px] normal-case text-cream outline-none placeholder:text-dim focus:border-lime/70";
const chip = (on: boolean) => `btn-press border-2 px-2.5 py-1.5 text-[9px] ${on ? "border-lime bg-lime text-bg" : "border-border text-cream hover:border-lime/60"}`;

/** Who's asking, in Portuguese (the request email keeps the English labels). */
const ADVERTISER_PT: Record<AdvertiserKind, string> = { indie: "Dev indie", startup: "Startup", company: "Empresa", agency: "Agência" };

/** The next four points weeks (their Mondays), labeled by their dates. */
function nextWeeks(lang: Lang): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const first = Date.parse(`${projectWeek(new Date())}T00:00:00Z`) + 7 * 86_400_000;
  for (let i = 0; i < 4; i++) {
    const start = new Date(first + i * 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    const f = (d: Date) => d.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    out.push({ id: start.toISOString().slice(0, 10), label: `${f(start)}–${f(end)}` });
  }
  return out;
}

export default function AdRequestSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { lang, t } = useLang();
  const weeks = useMemo(() => nextWeeks(lang), [lang]);
  const [what, setWhat] = useState("");
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<AdvertiserKind | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    const typed = amount.trim() ? Number(amount.replace(/[^\d]/g, "")) : null;
    try {
      const r = await fetch(`/api/towns/${slug}/brasil/ad-request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ what, url, email, kind, weeks: picked, budget: typed === null ? budget : null, amount: typed, notes, website }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError((j as { error?: string }).error ?? t("It didn't send. Try again.", "Não foi. Tenta de novo."));
      else {
        posthog.capture("ad_form_submitted", { budget: typed === null ? budget : "typed", amount: typed, kind, weeks: picked.length });
        setSent(true);
      }
    } catch {
      setError(t("No connection. Try again.", "Sem conexão. Tenta de novo."));
    }
    setBusy(false);
  };

  if (sent)
    return (
      <Overlay title={t("The #1 spot", "O espaço #1")} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-[12px] text-lime">
            <Check size={16} strokeWidth={3} aria-hidden /> {t("Got it", "Recebido")}
          </p>
          <p className="text-[11px] normal-case leading-relaxed text-warm">{t("We'll email you within 2 days.", "A gente te responde por email em até 2 dias.")}</p>
          <button type="button" onClick={onClose} className="btn-press min-h-10 border-2 border-border text-[10px] text-cream hover:border-lime/60">
            {t("Close", "Fechar")}
          </button>
        </div>
      </Overlay>
    );

  return (
    <Overlay title={t("The #1 spot", "O espaço #1")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p className="text-[11px] normal-case leading-relaxed text-warm">{t("Your project above the week's top 3, on the Brasil map, for a week. Tell us about it.", "Seu projeto acima do top 3 da semana, no mapa do Brasil, por uma semana. Conta pra gente.")}</p>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">{t("What you want to promote", "O que você quer divulgar")}</span>
          <input id="ad-what" className={input} value={what} onChange={(e) => setWhat(e.target.value)} maxLength={80} required autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">Link</span>
          <input id="ad-url" className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" maxLength={300} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">{t("Your email", "Seu email")}</span>
          <input id="ad-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">{t("You are", "Você é")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ADVERTISER_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                {lang === "pt" ? ADVERTISER_PT[k] : advertiserLabel[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">{t("Which weeks (optional)", "Quais semanas (opcional)")}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {weeks.map((w) => (
              <button key={w.id} type="button" aria-pressed={picked.includes(w.id)} onClick={() => setPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))} className={chip(picked.includes(w.id))}>
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">{t("What would you pay for one week at #1?", "Quanto você pagaria por uma semana no #1?")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {BUDGETS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={budget === b && !amount}
                onClick={() => {
                  setBudget(b);
                  setAmount("");
                }}
                className={chip(budget === b && !amount)}
              >
                {lang === "pt" ? budgetLabel(b).replace(/,/g, ".") : budgetLabel(b)}
              </button>
            ))}
          </div>
          <input id="ad-amount" className={`${input} mt-1.5`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("Or type a number in R$", "Ou digita um valor em R$")} inputMode="numeric" maxLength={9} />
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">{t("Anything else (optional)", "Mais alguma coisa (opcional)")}</span>
          <textarea id="ad-notes" className={`${input} min-h-[72px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </label>
        {/* Only bots fill this. */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        {error && <p className="text-[10px] normal-case text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="btn-press flex min-h-10 items-center justify-center gap-1.5 bg-lime text-[10px] text-bg disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" aria-hidden />} {t("Send", "Enviar")}
        </button>
      </form>
    </Overlay>
  );
}
