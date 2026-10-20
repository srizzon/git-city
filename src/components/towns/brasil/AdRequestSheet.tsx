"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import posthog from "posthog-js";
import { Overlay } from "./projects-ui";
import { ADVERTISER_KINDS, BUDGETS, advertiserLabel, budgetLabel, projectWeek, type AdvertiserKind, type Budget } from "@/lib/towns/brasil-projects";

// The ad slot's request form: what to promote, the link, an email, who they
// are, which weeks, and what they'd pay for a week at #1. It only emails the
// request; nothing is booked or charged here, and the page promises neither a
// price nor a date.

const input = "w-full border-2 border-border bg-bg px-3 py-2 font-sans text-[13px] normal-case text-cream outline-none placeholder:text-dim focus:border-lime/70";
const chip = (on: boolean) => `btn-press border-2 px-2.5 py-1.5 text-[9px] ${on ? "border-lime bg-lime text-bg" : "border-border text-cream hover:border-lime/60"}`;

/** The next four points weeks (their Mondays), labeled by their dates. */
function nextWeeks(): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const first = Date.parse(`${projectWeek(new Date())}T00:00:00Z`) + 7 * 86_400_000;
  for (let i = 0; i < 4; i++) {
    const start = new Date(first + i * 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    out.push({ id: start.toISOString().slice(0, 10), label: `${f(start)}–${f(end)}` });
  }
  return out;
}

export default function AdRequestSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const weeks = useMemo(() => nextWeeks(), []);
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
      if (!r.ok) setError((j as { error?: string }).error ?? "It didn't send. Try again.");
      else {
        posthog.capture("ad_form_submitted", { budget: typed === null ? budget : "typed", amount: typed, kind, weeks: picked.length });
        setSent(true);
      }
    } catch {
      setError("No connection. Try again.");
    }
    setBusy(false);
  };

  if (sent)
    return (
      <Overlay title="The #1 spot" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-[12px] text-lime">
            <Check size={16} strokeWidth={3} aria-hidden /> Got it
          </p>
          <p className="text-[11px] normal-case leading-relaxed text-warm">We&apos;ll email you within 2 days.</p>
          <button type="button" onClick={onClose} className="btn-press min-h-10 border-2 border-border text-[10px] text-cream hover:border-lime/60">
            Close
          </button>
        </div>
      </Overlay>
    );

  return (
    <Overlay title="The #1 spot" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p className="text-[11px] normal-case leading-relaxed text-warm">Your project above the week&apos;s top 3, on the Brasil map, for a week. Tell us about it.</p>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">What you want to promote</span>
          <input id="ad-what" className={input} value={what} onChange={(e) => setWhat(e.target.value)} maxLength={80} required autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">Link</span>
          <input id="ad-url" className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" maxLength={300} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">Your email</span>
          <input id="ad-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">You are</legend>
          <div className="flex flex-wrap gap-1.5">
            {ADVERTISER_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                {advertiserLabel[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">Which weeks (optional)</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {weeks.map((w) => (
              <button key={w.id} type="button" aria-pressed={picked.includes(w.id)} onClick={() => setPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))} className={chip(picked.includes(w.id))}>
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">What would you pay for one week at #1?</legend>
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
                {budgetLabel(b)}
              </button>
            ))}
          </div>
          <input id="ad-amount" className={`${input} mt-1.5`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Or type a number in R$" inputMode="numeric" maxLength={9} />
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] text-muted">Anything else (optional)</span>
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
          {busy && <Loader2 size={13} className="animate-spin" aria-hidden />} Send
        </button>
      </form>
    </Overlay>
  );
}
