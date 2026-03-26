"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import Link from "next/link";

const RichTextEditor = lazy(() => import("@/components/jobs/RichTextEditor"));
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  JOB_TIERS,
} from "@/lib/jobs/constants";
import type { JobTier, JobSeniority, JobContract, JobRoleType } from "@/lib/jobs/types";

const SENIORITY_OPTIONS: JobSeniority[] = ["junior", "mid", "senior", "staff", "lead"];
const ROLE_OPTIONS: JobRoleType[] = ["frontend", "backend", "fullstack", "devops", "mobile", "data", "design", "other"];
const CONTRACT_OPTIONS: JobContract[] = ["clt", "pj", "contract"];
const TIER_OPTIONS: JobTier[] = ["standard", "featured", "premium"];

const TIER_DESCRIPTIONS: Record<JobTier, string> = {
  standard: "Listed on the job board for 30 days",
  featured: "Pinned to the top for 7 days + highlighted",
  premium: "Pinned + highlighted + weekly digest + Discord announcement",
};

const STEPS = [
  { id: 1, label: "The Basics" },
  { id: 2, label: "Details" },
  { id: 3, label: "The Offer" },
  { id: 4, label: "Review" },
] as const;

const LS_KEY = "gc_post_job_draft";

interface FormData {
  title: string;
  roleType: JobRoleType;
  seniority: JobSeniority;
  description: string;
  techTags: string[];
  applyUrl: string;
  contractType: JobContract;
  salaryCurrency: string;
  salaryMin: string;
  salaryMax: string;
  badgeResponse: boolean;
  badgeNoAi: boolean;
  languagePtBr: string;
  tier: JobTier;
}

const DEFAULT_FORM: FormData = {
  title: "",
  roleType: "fullstack",
  seniority: "mid",
  description: "",
  techTags: [],
  applyUrl: "",
  contractType: "pj",
  salaryCurrency: "USD",
  salaryMin: "",
  salaryMax: "",
  badgeResponse: false,
  badgeNoAi: false,
  languagePtBr: "",
  tier: "standard",
};

export default function PostJobForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [techInput, setTechInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hasDraft, setHasDraft] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const techInputRef = useRef<HTMLInputElement>(null);

  // ── Load: localStorage first, then check for existing DB draft ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        setForm(JSON.parse(saved));
        setHasDraft(true);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  // ── LocalStorage: save on change (only after initial load) ──
  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(form)); } catch { /* ignore */ }
    }
  }, [form, loaded]);

  const clearDraft = () => {
    setForm(DEFAULT_FORM);
    setStep(1);
    setHasDraft(false);
    setError("");
    setFieldErrors({});
    localStorage.removeItem(LS_KEY);
  };

  const update = (partial: Partial<FormData>) => setForm((prev) => ({ ...prev, ...partial }));

  // ── Tech tags ──
  const addTech = (raw: string) => {
    const tag = raw.toLowerCase().trim();
    if (!tag || form.techTags.includes(tag) || form.techTags.length >= 15) return;
    update({ techTags: [...form.techTags, tag] });
    setTechInput("");
  };
  const removeTech = (tag: string) => update({ techTags: form.techTags.filter((t) => t !== tag) });
  const handleTechKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTech(techInput); }
    if (e.key === "Backspace" && !techInput && form.techTags.length > 0) removeTech(form.techTags[form.techTags.length - 1]);
  };

  // ── Validation per step ──
  function validateStep(s: number): Record<string, string> {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.title || form.title.length < 5) errs.title = "Title must be at least 5 characters";
      if (form.title.length > 100) errs.title = "Title max 100 characters";
    }
    if (s === 2) {
      const textLength = form.description.replace(/<[^>]*>/g, "").trim().length;
      if (!form.description || textLength < 50) errs.description = `Description needs ${Math.max(0, 50 - textLength)} more characters`;
      if (form.techTags.length === 0) errs.techTags = "Add at least 1 tech tag";
      if (form.applyUrl && !isValidUrl(form.applyUrl)) errs.applyUrl = "Must be a valid http/https URL";
      if (!form.applyUrl) errs.applyUrl = "Apply URL is required";
    }
    if (s === 3) {
      const min = Number(form.salaryMin);
      const max = Number(form.salaryMax);
      if (!min || min <= 0) errs.salaryMin = "Required";
      if (!max || max <= 0) errs.salaryMax = "Required";
      if (min > 0 && max > 0 && max < min) errs.salaryMax = "Must be ≥ min";
    }
    return errs;
  }

  function canProceed(s: number): boolean {
    return Object.keys(validateStep(s)).length === 0;
  }

  function goNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0 });
  }

  function goBack() {
    setFieldErrors({});
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0 });
  }

  function goToStep(s: number) {
    // Only allow going to completed steps or current
    if (s > step) return;
    setFieldErrors({});
    setStep(s);
    window.scrollTo({ top: 0 });
  }

  // ── Submit ──
  async function handleSubmit() {
    if (submitting) return; // prevent double-click
    setError("");
    setSubmitting(true);

    try {
      const createRes = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          salary_min: parseInt(form.salaryMin),
          salary_max: parseInt(form.salaryMax),
          salary_currency: form.salaryCurrency,
          role_type: form.roleType,
          tech_stack: form.techTags,
          seniority: form.seniority,
          contract_type: form.contractType,
          web_type: "both",
          apply_url: form.applyUrl,
          language_pt_br: form.languagePtBr || null,
          badge_response_guaranteed: form.badgeResponse,
          badge_no_ai_screening: form.badgeNoAi,
        }),
      });

      if (!createRes.ok) {
        const d = await createRes.json();
        setError(d.error ?? "Failed to create listing");
        setSubmitting(false);
        return;
      }

      const { listing } = await createRes.json();

      const checkoutRes = await fetch("/api/jobs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listing.id, tier: form.tier }),
      });

      if (!checkoutRes.ok) {
        setError("Failed to create checkout session. Your listing was saved as draft.");
        setSubmitting(false);
        return;
      }

      // DON'T clear localStorage here — user might click Back from Stripe.
      // localStorage is cleared on the dashboard when ?posted= param is detected.
      const { url } = await checkoutRes.json();
      window.location.href = url;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  const inputClass = "w-full border-[3px] border-border bg-bg px-4 py-3 text-sm text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime";

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Nav */}
        <Link href="/jobs/dashboard" className="text-sm text-muted transition-colors hover:text-cream">
          &lt; Back to dashboard
        </Link>

        <div className="mt-6 flex items-center justify-between">
          <h1 className="text-2xl text-lime sm:text-3xl">Post a Job</h1>
          {hasDraft && (
            <button
              onClick={clearDraft}
              className="text-xs text-dim transition-colors hover:text-muted normal-case"
            >
              Start fresh
            </button>
          )}
        </div>

        {/* ── Progress indicator ── */}
        <nav className="mt-8" aria-label="Form progress">
          <ol className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const isCompleted = step > s.id;
              const isCurrent = step === s.id;
              const isFuture = step < s.id;
              return (
                <li key={s.id} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : "none" }}>
                  {/* Dot + label */}
                  <button
                    onClick={() => goToStep(s.id)}
                    disabled={isFuture}
                    aria-current={isCurrent ? "step" : undefined}
                    className="flex flex-col items-center gap-1.5 disabled:cursor-default"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center border-[3px] text-xs transition-colors"
                      style={{
                        borderColor: isCurrent ? "#c8e64a" : isCompleted ? "#c8e64a" : "var(--color-border)",
                        backgroundColor: isCompleted ? "#c8e64a" : isCurrent ? "rgba(200,230,74,0.1)" : "transparent",
                        color: isCompleted ? "#0d0d0f" : isCurrent ? "#c8e64a" : "var(--color-dim)",
                      }}
                    >
                      {isCompleted ? "✓" : s.id}
                    </div>
                    <span
                      className="hidden text-[10px] sm:block"
                      style={{ color: isCurrent ? "#c8e64a" : isCompleted ? "var(--color-cream)" : "var(--color-dim)" }}
                    >
                      {s.label}
                    </span>
                  </button>
                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div
                      className="mx-1 h-[3px] flex-1"
                      style={{ backgroundColor: isCompleted ? "#c8e64a" : "var(--color-border)" }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {/* Mobile: show current step text */}
          <p className="mt-3 text-xs text-muted sm:hidden">
            Step {step} of {STEPS.length} — {STEPS[step - 1].label}
          </p>
        </nav>

        {/* ═══════ STEP 1: THE BASICS ═══════ */}
        {step === 1 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            <div>
              <label htmlFor="pj-title" className="text-sm text-cream">
                Job title <span className="text-lime">*</span>
              </label>
              <p className="mt-1 text-xs text-muted normal-case">
                Keep it clear — no "REMOTE" or salary in the title
              </p>
              <input
                id="pj-title"
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Senior React Developer"
                maxLength={100}
                autoFocus
                className={`${inputClass} mt-2`}
                style={{ fontFamily: "inherit" }}
              />
              {fieldErrors.title && <p className="mt-1 text-xs text-red-400 normal-case">{fieldErrors.title}</p>}
            </div>

            <div className="h-px bg-border/50" />

            <div>
              <span className="text-sm text-cream">Role <span className="text-lime">*</span></span>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Role type">
                {ROLE_OPTIONS.map((r) => (
                  <Chip key={r} active={form.roleType === r} onClick={() => update({ roleType: r })}>
                    {ROLE_TYPE_LABELS[r]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="h-px bg-border/50" />

            <div>
              <span className="text-sm text-cream">Seniority <span className="text-lime">*</span></span>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Seniority">
                {SENIORITY_OPTIONS.map((s) => (
                  <Chip key={s} active={form.seniority === s} onClick={() => update({ seniority: s })}>
                    {SENIORITY_LABELS[s]}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ STEP 2: DETAILS ═══════ */}
        {step === 2 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            <div>
              <span className="text-sm text-cream">
                Description <span className="text-lime">*</span>
              </span>
              <p className="mt-1 text-xs text-muted normal-case">
                Good descriptions get 3x more applies. Paste from anywhere or use the template.
              </p>
              <div className="mt-3">
                <Suspense fallback={
                  <div className="border-[3px] border-border bg-bg px-4 py-8 text-center text-xs text-dim">
                    Loading editor...
                  </div>
                }>
                  <RichTextEditor
                    content={form.description}
                    onChange={(html) => update({ description: html })}
                    placeholder="Describe the role — responsibilities, requirements, benefits. Or click 'Use template' above."
                  />
                </Suspense>
              </div>
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-red-400 normal-case">{fieldErrors.description}</p>
              )}
            </div>

            <div className="h-px bg-border/50" />

            <div>
              <label htmlFor="pj-tech" className="text-sm text-cream">
                Tech Stack <span className="text-lime">*</span>
              </label>
              <p className="mt-1 text-xs text-muted normal-case">
                Press Enter or comma to add. Matched against developer skills.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  id="pj-tech"
                  ref={techInputRef}
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  onKeyDown={handleTechKeyDown}
                  autoFocus={form.description.length >= 50}
                  placeholder={form.techTags.length === 0 ? "react" : "add another..."}
                  className={`${inputClass} flex-1`}
                  style={{ fontFamily: "inherit" }}
                  disabled={form.techTags.length >= 15}
                />
                <button
                  onClick={() => { addTech(techInput); techInputRef.current?.focus(); }}
                  disabled={!techInput.trim() || form.techTags.length >= 15}
                  className="btn-press shrink-0 border-[3px] border-border px-5 text-sm text-cream disabled:opacity-30"
                >
                  Add
                </button>
              </div>
              {form.techTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.techTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => removeTech(tag)}
                      className="group flex items-center gap-2 border-[3px] px-4 py-2 text-sm transition-colors hover:border-red-500/40"
                      style={{ borderColor: "rgba(200,230,74,0.3)", color: "#c8e64a" }}
                      aria-label={`Remove ${tag}`}
                    >
                      {tag}
                      <span className="text-dim group-hover:text-red-400">x</span>
                    </button>
                  ))}
                </div>
              )}
              {fieldErrors.techTags && <p className="mt-1 text-xs text-red-400 normal-case">{fieldErrors.techTags}</p>}
              <p className="mt-1 text-xs text-dim">{form.techTags.length}/15</p>
            </div>

            <div className="h-px bg-border/50" />

            <div>
              <label htmlFor="pj-apply" className="text-sm text-cream">
                Apply URL <span className="text-lime">*</span>
              </label>
              <p className="mt-1 text-xs text-muted normal-case">
                Where candidates will be redirected when they click Apply
              </p>
              <input
                id="pj-apply"
                value={form.applyUrl}
                onChange={(e) => update({ applyUrl: e.target.value })}
                placeholder="https://company.com/careers/senior-react"
                className={`${inputClass} mt-2`}
                style={{ fontFamily: "inherit" }}
              />
              {fieldErrors.applyUrl && <p className="mt-1 text-xs text-red-400 normal-case">{fieldErrors.applyUrl}</p>}
            </div>
          </div>
        )}

        {/* ═══════ STEP 3: THE OFFER ═══════ */}
        {step === 3 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            <div>
              <span className="text-sm text-cream">Contract <span className="text-lime">*</span></span>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Contract type">
                {CONTRACT_OPTIONS.map((c) => (
                  <Chip key={c} active={form.contractType === c} onClick={() => update({ contractType: c })}>
                    {CONTRACT_LABELS[c]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="h-px bg-border/50" />

            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cream">Salary <span className="text-lime">*</span></span>
                <div className="flex gap-1">
                  {(["USD", "BRL", "EUR"] as const).map((cur) => (
                    <button
                      key={cur}
                      onClick={() => update({ salaryCurrency: cur })}
                      className="border-2 px-2.5 py-0.5 text-[10px] transition-colors"
                      style={{
                        borderColor: form.salaryCurrency === cur ? "#c8e64a" : "var(--color-border)",
                        color: form.salaryCurrency === cur ? "#c8e64a" : "var(--color-dim)",
                      }}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted normal-case">
                All listings require visible salary — no &quot;competitive compensation&quot;
              </p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  value={form.salaryMin}
                  onChange={(e) => update({ salaryMin: e.target.value })}
                  placeholder="Min"
                  aria-label="Minimum salary"
                  className={`${inputClass} flex-1 min-w-0`}
                  style={{ fontFamily: "inherit" }}
                />
                <span className="text-base text-dim shrink-0">—</span>
                <input
                  type="number"
                  value={form.salaryMax}
                  onChange={(e) => update({ salaryMax: e.target.value })}
                  placeholder="Max"
                  aria-label="Maximum salary"
                  className={`${inputClass} flex-1 min-w-0`}
                  style={{ fontFamily: "inherit" }}
                />
              </div>
              <div className="mt-1 flex gap-4">
                {fieldErrors.salaryMin && <span className="text-xs text-red-400 normal-case">{fieldErrors.salaryMin}</span>}
                {fieldErrors.salaryMax && <span className="text-xs text-red-400 normal-case">{fieldErrors.salaryMax}</span>}
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Trust badges */}
            <div className="space-y-4">
              <span className="text-sm text-cream">Trust Badges</span>
              <p className="text-xs text-muted normal-case">
                Optional — these appear on your listing and build candidate trust
              </p>
              <label htmlFor="pj-badge-response" className="flex items-center gap-3 cursor-pointer">
                <input
                  id="pj-badge-response"
                  type="checkbox"
                  checked={form.badgeResponse}
                  onChange={(e) => update({ badgeResponse: e.target.checked })}
                  className="accent-lime h-5 w-5 shrink-0"
                />
                <div>
                  <span className="text-sm text-cream">Response Guaranteed</span>
                  <p className="mt-0.5 text-xs text-muted normal-case">You reply to every applicant</p>
                </div>
              </label>
              <label htmlFor="pj-badge-noai" className="flex items-center gap-3 cursor-pointer">
                <input
                  id="pj-badge-noai"
                  type="checkbox"
                  checked={form.badgeNoAi}
                  onChange={(e) => update({ badgeNoAi: e.target.checked })}
                  className="accent-lime h-5 w-5 shrink-0"
                />
                <div>
                  <span className="text-sm text-cream">No AI Screening</span>
                  <p className="mt-0.5 text-xs text-muted normal-case">Humans review every application</p>
                </div>
              </label>
            </div>

            <div className="h-px bg-border/50" />

            {/* PT-BR (collapsed optional) */}
            <div>
              <label htmlFor="pj-ptbr" className="text-xs text-muted">
                PT-BR Description
              </label>
              <p className="mt-1 text-xs text-dim normal-case">Optional — 20% of our devs are Brazilian</p>
              <textarea
                id="pj-ptbr"
                value={form.languagePtBr}
                onChange={(e) => update({ languagePtBr: e.target.value })}
                rows={4}
                placeholder="Descrição em português..."
                className={`${inputClass} mt-2 resize-none`}
                style={{ fontFamily: "inherit" }}
              />
            </div>
          </div>
        )}

        {/* ═══════ STEP 4: REVIEW & PAY ═══════ */}
        {step === 4 && (
          <div className="mt-8 space-y-6">
            {/* Preview */}
            <div className="border-[3px] border-lime/30 bg-bg-raised p-6 sm:p-8 space-y-4">
              <p className="text-xs text-lime">Preview — this is how devs will see your listing</p>
              <h2 className="text-xl text-cream sm:text-2xl">{form.title}</h2>
              <p className="text-sm text-muted">
                {SENIORITY_LABELS[form.seniority]} · {ROLE_TYPE_LABELS[form.roleType]} · {CONTRACT_LABELS[form.contractType]}
              </p>
              <p className="text-base text-lime">
                {form.salaryCurrency} {parseInt(form.salaryMin).toLocaleString()}–{parseInt(form.salaryMax).toLocaleString()}
              </p>
              <div className="flex flex-wrap gap-2">
                {form.techTags.map((t) => (
                  <span key={t} className="border-[3px] px-3 py-1 text-xs" style={{ borderColor: "rgba(200,230,74,0.3)", color: "#c8e64a" }}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="border-t border-border/50 pt-4">
                <div className="tiptap text-sm text-cream-dark normal-case leading-relaxed" dangerouslySetInnerHTML={{ __html: form.description }} />
              </div>
              {(form.badgeResponse || form.badgeNoAi) && (
                <div className="flex gap-3">
                  {form.badgeResponse && <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">Response Guaranteed</span>}
                  {form.badgeNoAi && <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">No AI Screening</span>}
                </div>
              )}
            </div>

            {/* Tier selection */}
            <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
              <span className="text-sm text-cream">Choose a tier</span>
              <div className="mt-4 space-y-3">
                {TIER_OPTIONS.map((t) => {
                  const cfg = JOB_TIERS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => update({ tier: t })}
                      aria-pressed={form.tier === t}
                      className="flex w-full items-center justify-between border-[3px] p-5 text-left transition-colors"
                      style={{
                        borderColor: form.tier === t ? "#c8e64a" : "var(--color-border)",
                        backgroundColor: form.tier === t ? "rgba(200,230,74,0.05)" : "transparent",
                      }}
                    >
                      <div>
                        <span className="text-sm" style={{ color: form.tier === t ? "#c8e64a" : "var(--color-cream)" }}>
                          {cfg.label}
                        </span>
                        <p className="mt-1 text-xs text-muted normal-case">{TIER_DESCRIPTIONS[t]}</p>
                      </div>
                      <span className="text-base text-cream shrink-0 ml-4">
                        ${(cfg.price_usd_cents / 100).toFixed(0)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="border-[3px] border-red-500/30 bg-red-500/5 px-5 py-4">
                <p className="text-sm text-red-400 normal-case">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <button
              onClick={goBack}
              className="btn-press border-[3px] border-border px-6 py-4 text-sm text-cream"
            >
              Back
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={goNext}
              disabled={!canProceed(step)}
              className="btn-press flex-1 bg-lime py-4 text-sm text-bg disabled:opacity-40"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-press flex-1 bg-lime py-4 text-sm text-bg disabled:opacity-50"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {submitting ? "Processing..." : `Pay $${(JOB_TIERS[form.tier].price_usd_cents / 100).toFixed(0)} & Submit`}
            </button>
          )}
        </div>

        {/* Paying state overlay */}
        {submitting && (
          <div className="mt-4 text-center">
            <div className="mx-auto h-4 w-4 animate-pulse bg-lime" />
            <p className="mt-2 text-xs text-muted">Redirecting to payment...</p>
          </div>
        )}

        <div className="h-12" />
      </div>
    </main>
  );
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="border-[3px] px-5 py-2.5 text-sm transition-colors"
      style={{
        borderColor: active ? "#c8e64a" : "var(--color-border)",
        color: active ? "#c8e64a" : "var(--color-muted)",
        backgroundColor: active ? "rgba(200,230,74,0.08)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}
