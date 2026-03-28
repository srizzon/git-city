"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import Link from "next/link";

const RichTextEditor = lazy(() => import("@/components/jobs/RichTextEditor"));
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_RESTRICTION_LABELS,
  SALARY_PERIOD_LABELS,
  BENEFITS_LIST,
  JOB_TIERS,
} from "@/lib/jobs/constants";
import type { JobTier, JobSeniority, JobContract, JobRoleType, JobLocationType, JobLocationRestriction, JobSalaryPeriod } from "@/lib/jobs/types";

/* ─── Options ─── */

const ROLE_OPTIONS: JobRoleType[] = [
  "frontend", "backend", "fullstack", "mobile", "devops", "cloud", "sre",
  "data", "ai_ml", "security", "qa", "blockchain", "embedded", "gamedev",
  "design", "engineering_manager", "other",
];
const SENIORITY_OPTIONS: JobSeniority[] = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "director"];
const CONTRACT_OPTIONS: JobContract[] = ["fulltime", "parttime", "clt", "pj", "contract", "freelance", "internship"];
const LOCATION_OPTIONS: JobLocationType[] = ["remote", "hybrid", "onsite"];
const RESTRICTION_OPTIONS: JobLocationRestriction[] = ["worldwide", "americas", "europe", "asia", "latam", "africa", "oceania", "specific"];
const CURRENCY_OPTIONS = ["USD", "BRL", "EUR", "GBP"] as const;
const SALARY_PERIOD_OPTIONS: JobSalaryPeriod[] = ["monthly", "annual"];
const LANGUAGE_OPTIONS = [
  { id: "en", label: "English" },
  { id: "pt", label: "Portuguese" },
  { id: "es", label: "Spanish" },
] as const;

const STEPS = [
  { id: 1, label: "The Job" },
  { id: 2, label: "Description" },
  { id: 3, label: "Tech & Perks" },
  { id: 4, label: "Compensation" },
  { id: 5, label: "Review" },
] as const;

const LS_KEY = "gc_post_job_draft";

/* ─── Suggested tech stacks per role ─── */

const SUGGESTED_TECH: Partial<Record<JobRoleType, string[]>> = {
  frontend: ["react", "typescript", "javascript", "next.js", "css", "tailwind", "html", "vue", "angular"],
  backend: ["node.js", "python", "java", "go", "postgresql", "mongodb", "redis", "docker", "aws"],
  fullstack: ["react", "node.js", "typescript", "postgresql", "docker", "next.js", "tailwind", "aws"],
  mobile: ["react native", "swift", "kotlin", "flutter", "ios", "android", "typescript"],
  devops: ["docker", "kubernetes", "terraform", "aws", "ci/cd", "linux", "ansible", "github actions"],
  cloud: ["aws", "gcp", "azure", "terraform", "kubernetes", "docker", "serverless", "lambda"],
  sre: ["kubernetes", "prometheus", "grafana", "terraform", "linux", "python", "docker", "aws"],
  data: ["python", "sql", "spark", "airflow", "dbt", "snowflake", "pandas", "tableau"],
  ai_ml: ["python", "pytorch", "tensorflow", "pandas", "scikit-learn", "llm", "hugging face", "aws"],
  security: ["python", "linux", "aws", "docker", "owasp", "penetration testing", "siem"],
  qa: ["selenium", "cypress", "jest", "python", "postman", "jira", "ci/cd"],
  blockchain: ["solidity", "ethereum", "web3.js", "hardhat", "rust", "solana", "typescript"],
  embedded: ["c", "c++", "rtos", "linux", "arm", "python", "mqtt", "firmware"],
  gamedev: ["unity", "c#", "unreal", "c++", "godot", "blender", "3d", "pixel art"],
  design: ["figma", "sketch", "adobe xd", "css", "html", "tailwind", "framer"],
  engineering_manager: ["agile", "scrum", "jira", "okrs", "system design", "architecture"],
};

/* ─── Description templates per role ─── */

function getDescriptionTemplate(role: JobRoleType, seniority: JobSeniority): string {
  const senLabel = SENIORITY_LABELS[seniority] ?? "Mid-Level";
  const roleLabel = ROLE_TYPE_LABELS[role] ?? "Developer";

  return `<h2>About the role</h2>
<p>We're looking for a ${senLabel} ${roleLabel} to join our team. You'll work on [describe the product/project] and help us [describe the impact].</p>

<h2>What you'll do</h2>
<ul>
<li>[Key responsibility 1]</li>
<li>[Key responsibility 2]</li>
<li>[Key responsibility 3]</li>
<li>[Key responsibility 4]</li>
</ul>

<h2>What we're looking for</h2>
<ul>
<li>[Required skill or experience 1]</li>
<li>[Required skill or experience 2]</li>
<li>[Required skill or experience 3]</li>
</ul>

<h2>Nice to have</h2>
<ul>
<li>[Optional skill 1]</li>
<li>[Optional skill 2]</li>
</ul>

<h2>What we offer</h2>
<ul>
<li>[Benefit 1]</li>
<li>[Benefit 2]</li>
<li>[Benefit 3]</li>
</ul>`;
}

/* ─── Form State ─── */

interface FormData {
  title: string;
  roleType: JobRoleType;
  seniority: JobSeniority;
  locationType: JobLocationType;
  locationRestriction: JobLocationRestriction;
  locationCity: string;
  locationTimezone: string;
  language: string;
  description: string;
  techTags: string[];
  applyUrl: string;
  benefits: string[];
  badgeResponse: boolean;
  badgeNoAi: boolean;
  contractTypes: JobContract[];
  salaryCurrency: string;
  salaryPeriod: JobSalaryPeriod;
  salaryMin: string;
  salaryMax: string;
}

const DEFAULT_FORM: FormData = {
  title: "",
  roleType: "fullstack",
  seniority: "mid",
  locationType: "remote",
  locationRestriction: "worldwide",
  locationCity: "",
  locationTimezone: "",
  language: "en",
  description: "",
  techTags: [],
  applyUrl: "",
  benefits: [],
  badgeResponse: false,
  badgeNoAi: false,
  contractTypes: ["fulltime"],
  salaryCurrency: "USD",
  salaryPeriod: "annual",
  salaryMin: "",
  salaryMax: "",
};

/* ─── Main ─── */

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) { setForm({ ...DEFAULT_FORM, ...JSON.parse(saved) }); setHasDraft(true); }
    } catch { /* */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(form)); } catch { /* */ }
    }
  }, [form, loaded]);

  const clearDraft = () => { setForm(DEFAULT_FORM); setStep(1); setHasDraft(false); setError(""); setFieldErrors({}); localStorage.removeItem(LS_KEY); };
  const update = (partial: Partial<FormData>) => setForm((prev) => ({ ...prev, ...partial }));

  // Tech tags
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

  // Contract multi-select
  const toggleContract = (c: JobContract) => {
    const set = new Set(form.contractTypes);
    if (set.has(c)) { set.delete(c); } else { set.add(c); }
    if (set.size === 0) return; // at least one
    update({ contractTypes: [...set] });
  };

  // Benefits toggle
  const toggleBenefit = (id: string) => {
    const set = new Set(form.benefits);
    if (set.has(id)) set.delete(id); else set.add(id);
    update({ benefits: [...set] });
  };

  // Validation
  function validateStep(s: number): Record<string, string> {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.title || form.title.length < 5) errs.title = "Title must be at least 5 characters";
      if (form.title.length > 100) errs.title = "Title max 100 characters";
    }
    if (s === 2) {
      const textLength = form.description.replace(/<[^>]*>/g, "").trim().length;
      if (!form.description || textLength < 50) errs.description = `Description needs ${Math.max(0, 50 - textLength)} more characters`;
    }
    if (s === 3) {
      if (form.techTags.length === 0) errs.techTags = "Add at least 1 tech tag";
      if (form.applyUrl && !isValidUrl(form.applyUrl)) errs.applyUrl = "Must be a valid http/https URL";
      if (!form.applyUrl) errs.applyUrl = "Apply URL is required";
    }
    if (s === 4) {
      const min = Number(form.salaryMin);
      const max = Number(form.salaryMax);
      if (!min || min <= 0) errs.salaryMin = "Required";
      if (!max || max <= 0) errs.salaryMax = "Required";
      if (min > 0 && max > 0 && max < min) errs.salaryMax = "Must be >= min";
    }
    return errs;
  }

  function canProceed(s: number): boolean { return Object.keys(validateStep(s)).length === 0; }

  function goNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0 });
  }

  function goBack() { setFieldErrors({}); setStep((s) => Math.max(1, s - 1)); window.scrollTo({ top: 0 }); }
  function goToStep(s: number) { if (s > step) return; setFieldErrors({}); setStep(s); window.scrollTo({ top: 0 }); }

  // Submit
  async function handleSubmit() {
    if (submitting) return;
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
          salary_period: form.salaryPeriod,
          role_type: form.roleType,
          tech_stack: form.techTags,
          seniority: form.seniority,
          contract_type: form.contractTypes[0],
          web_type: "both",
          apply_url: form.applyUrl,
          location_type: form.locationType,
          location_restriction: form.locationRestriction,
          location_city: form.locationCity || null,
          location_timezone: form.locationTimezone || null,
          location_countries: [],
          benefits: form.benefits,
          language: form.language,
          language_pt_br: null,
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

      // Auto-free for founding companies
      const checkoutRes = await fetch("/api/jobs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listing.id, tier: "free" }),
      });

      if (!checkoutRes.ok) {
        const d = await checkoutRes.json();
        if (d.error?.includes("limit")) {
          // Free limit reached, redirect to tier selection
          setError("Free listing already used. Choose a paid tier.");
          setSubmitting(false);
          return;
        }
        setError("Failed to submit. Your listing was saved as draft.");
        setSubmitting(false);
        return;
      }

      localStorage.removeItem(LS_KEY);
      const { url } = await checkoutRes.json();
      window.location.href = url;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const inputClass = "w-full border-[3px] border-border bg-bg px-4 py-3 text-sm text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime";

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">

        {/* Nav */}
        <Link href="/jobs/dashboard" className="text-xs text-dim transition-colors hover:text-muted">
          &larr; Back to dashboard
        </Link>

        <div className="mt-6 flex items-center justify-between">
          <h1 className="text-2xl text-lime sm:text-3xl">Post a Job</h1>
          {hasDraft && (
            <button onClick={clearDraft} className="text-xs text-dim transition-colors hover:text-muted normal-case cursor-pointer">
              Start fresh
            </button>
          )}
        </div>

        {/* ── Progress ── */}
        <nav className="mt-8" aria-label="Form progress">
          <ol className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const isCompleted = step > s.id;
              const isCurrent = step === s.id;
              const isFuture = step < s.id;
              return (
                <li key={s.id} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : "none" }}>
                  <button
                    onClick={() => goToStep(s.id)}
                    disabled={isFuture}
                    aria-current={isCurrent ? "step" : undefined}
                    className="flex flex-col items-center gap-1.5 disabled:cursor-default cursor-pointer"
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
                    <span className="hidden text-xs sm:block" style={{ color: isCurrent ? "#c8e64a" : isCompleted ? "var(--color-cream)" : "var(--color-dim)" }}>
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className="mx-1 h-[3px] flex-1" style={{ backgroundColor: isCompleted ? "#c8e64a" : "var(--color-border)" }} />
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted sm:hidden">Step {step} of {STEPS.length} — {STEPS[step - 1].label}</p>
        </nav>

        {/* ═══ STEP 1: THE JOB ═══ */}
        {step === 1 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            <Field label="Job title" required hint="e.g. Senior React Developer, Backend Engineer, Product Designer">
              <input value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="Senior React Developer" maxLength={100} autoFocus className={`${inputClass} mt-2`} />
              {fieldErrors.title && <Err>{fieldErrors.title}</Err>}
            </Field>

            <Sep />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Role" required>
                <select value={form.roleType} onChange={(e) => update({ roleType: e.target.value as JobRoleType })} className={`${inputClass} mt-2 cursor-pointer`}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_TYPE_LABELS[r]}</option>)}
                </select>
              </Field>
              <Field label="Seniority" required>
                <select value={form.seniority} onChange={(e) => update({ seniority: e.target.value as JobSeniority })} className={`${inputClass} mt-2 cursor-pointer`}>
                  {SENIORITY_OPTIONS.map((s) => <option key={s} value={s}>{SENIORITY_LABELS[s]}</option>)}
                </select>
              </Field>
            </div>

            <Sep />

            <Field label="Location" required>
              <div className="mt-3 flex flex-wrap gap-2">
                {LOCATION_OPTIONS.map((l) => <Chip key={l} active={form.locationType === l} onClick={() => update({ locationType: l })}>{LOCATION_TYPE_LABELS[l]}</Chip>)}
              </div>
              {form.locationType === "remote" && (
                <div className="mt-3">
                  <p className="text-xs text-muted mb-2 normal-case">Where can candidates be located?</p>
                  <div className="flex flex-wrap gap-2">
                    {RESTRICTION_OPTIONS.map((r) => <Chip key={r} active={form.locationRestriction === r} onClick={() => update({ locationRestriction: r })}>{LOCATION_RESTRICTION_LABELS[r]}</Chip>)}
                  </div>
                </div>
              )}
              {(form.locationType === "hybrid" || form.locationType === "onsite") && (
                <input value={form.locationCity} onChange={(e) => update({ locationCity: e.target.value })} placeholder="City, Country" className={`${inputClass} mt-3`} />
              )}
              <input value={form.locationTimezone} onChange={(e) => update({ locationTimezone: e.target.value })} placeholder="Timezone preference (e.g. UTC-3 to UTC+1) - optional" className={`${inputClass} mt-2`} />
            </Field>

            <Sep />

            <Field label="Listing language" hint="The language your job description is written in">
              <div className="mt-3 flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((l) => <Chip key={l.id} active={form.language === l.id} onClick={() => update({ language: l.id })}>{l.label}</Chip>)}
              </div>
            </Field>
          </div>
        )}

        {/* ═══ STEP 2: DESCRIPTION ═══ */}
        {step === 2 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8">
            <Field label="Job description" required hint="Paste from Google Docs, Notion, or anywhere. Or use our template to get started.">
              {form.description.replace(/<[^>]*>/g, "").trim().length < 10 && (
                <button
                  onClick={() => update({ description: getDescriptionTemplate(form.roleType, form.seniority) })}
                  className="mt-3 mb-2 border-[3px] border-lime/20 px-4 py-2.5 text-xs text-lime transition-colors hover:border-lime/40 hover:bg-lime/5 cursor-pointer normal-case"
                >
                  Start with a template for {ROLE_TYPE_LABELS[form.roleType]}
                </button>
              )}
              <div className="mt-3">
                <Suspense fallback={<div className="border-[3px] border-border bg-bg px-4 py-12 text-center text-xs text-dim">Loading editor...</div>}>
                  <RichTextEditor
                    content={form.description}
                    onChange={(html) => update({ description: html })}
                    placeholder="Paste your job description here, or use the template above..."
                  />
                </Suspense>
              </div>
              {fieldErrors.description && <Err>{fieldErrors.description}</Err>}
            </Field>
          </div>
        )}

        {/* ═══ STEP 3: TECH & PERKS ═══ */}
        {step === 3 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            {/* Tech stack */}
            <Field label="Tech stack" required hint="Click suggestions or type your own">
              {(() => {
                const suggestions = (SUGGESTED_TECH[form.roleType] ?? []).filter((t) => !form.techTags.includes(t));
                if (suggestions.length === 0) return null;
                return (
                  <div className="mt-2 mb-3">
                    <p className="text-xs text-dim mb-1.5 normal-case">Popular for {ROLE_TYPE_LABELS[form.roleType]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((tag) => (
                        <button key={tag} onClick={() => addTech(tag)} disabled={form.techTags.length >= 15} className="border-[2px] border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-lime/30 hover:text-lime cursor-pointer disabled:opacity-30">
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {form.techTags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {form.techTags.map((tag) => (
                    <button key={tag} onClick={() => removeTech(tag)} className="group flex items-center gap-2 border-[3px] px-3 py-1.5 text-xs transition-colors hover:border-red-500/40 cursor-pointer" style={{ borderColor: "rgba(200,230,74,0.3)", color: "#c8e64a" }}>
                      {tag} <span className="text-dim group-hover:text-red-400">x</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input ref={techInputRef} value={techInput} onChange={(e) => setTechInput(e.target.value)} onKeyDown={handleTechKeyDown} placeholder="Type to add custom tech..." className={`${inputClass} flex-1`} disabled={form.techTags.length >= 15} />
                <button onClick={() => { addTech(techInput); techInputRef.current?.focus(); }} disabled={!techInput.trim() || form.techTags.length >= 15} className="btn-press shrink-0 border-[3px] border-border px-5 text-xs text-cream disabled:opacity-30 cursor-pointer">Add</button>
              </div>
              {fieldErrors.techTags && <Err>{fieldErrors.techTags}</Err>}
            </Field>

            <Sep />

            {/* Apply URL */}
            <Field label="Apply URL" required hint="Where candidates go when they click Apply">
              <input value={form.applyUrl} onChange={(e) => update({ applyUrl: e.target.value })} placeholder="https://company.com/careers/role" className={`${inputClass} mt-2`} />
              {fieldErrors.applyUrl && <Err>{fieldErrors.applyUrl}</Err>}
            </Field>

            <Sep />

            {/* Benefits */}
            <Field label="Benefits" hint="Select what you offer. Helps candidates decide.">
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {BENEFITS_LIST.map((b) => (
                  <label key={b.id} className="flex items-center gap-3 cursor-pointer px-3 py-2 transition-colors hover:bg-bg/50">
                    <input type="checkbox" checked={form.benefits.includes(b.id)} onChange={() => toggleBenefit(b.id)} className="accent-lime h-4 w-4 shrink-0" />
                    <span className="text-xs text-cream normal-case">{b.label}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Sep />

            {/* Trust badges */}
            <Field label="Trust badges" hint="Stand out from other listings">
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.badgeResponse} onChange={(e) => update({ badgeResponse: e.target.checked })} className="accent-lime h-4 w-4 shrink-0" />
                  <div>
                    <span className="text-xs text-cream">Response Guaranteed</span>
                    <p className="text-xs text-dim normal-case">You reply to every applicant</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.badgeNoAi} onChange={(e) => update({ badgeNoAi: e.target.checked })} className="accent-lime h-4 w-4 shrink-0" />
                  <div>
                    <span className="text-xs text-cream">No AI Screening</span>
                    <p className="text-xs text-dim normal-case">Humans review every application</p>
                  </div>
                </label>
              </div>
            </Field>
          </div>
        )}

        {/* ═══ STEP 4: COMPENSATION ═══ */}
        {step === 4 && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            <Field label="Contract type" required hint="Select all that apply">
              <div className="mt-3 flex flex-wrap gap-2">
                {CONTRACT_OPTIONS.map((c) => <Chip key={c} active={form.contractTypes.includes(c)} onClick={() => toggleContract(c)}>{CONTRACT_LABELS[c]}</Chip>)}
              </div>
            </Field>

            <Sep />

            <Field label="Salary" required hint="All listings require visible salary. Developers skip jobs without it.">
              <div className="mt-3 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-dim mb-1.5 normal-case">Currency</p>
                  <div className="flex gap-1.5">
                    {CURRENCY_OPTIONS.map((cur) => <Chip key={cur} active={form.salaryCurrency === cur} onClick={() => update({ salaryCurrency: cur })}>{cur}</Chip>)}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-dim mb-1.5 normal-case">Period</p>
                  <div className="flex gap-1.5">
                    {SALARY_PERIOD_OPTIONS.map((p) => <Chip key={p} active={form.salaryPeriod === p} onClick={() => update({ salaryPeriod: p })}>{p === "monthly" ? "Monthly" : "Annual"}</Chip>)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <input type="number" value={form.salaryMin} onChange={(e) => update({ salaryMin: e.target.value })} placeholder="Min" className={`${inputClass} flex-1 min-w-0`} />
                <span className="text-sm text-dim shrink-0">to</span>
                <input type="number" value={form.salaryMax} onChange={(e) => update({ salaryMax: e.target.value })} placeholder="Max" className={`${inputClass} flex-1 min-w-0`} />
                <span className="text-xs text-dim shrink-0">{SALARY_PERIOD_LABELS[form.salaryPeriod]}</span>
              </div>
              <div className="mt-1 flex gap-4">
                {fieldErrors.salaryMin && <Err>{fieldErrors.salaryMin}</Err>}
                {fieldErrors.salaryMax && <Err>{fieldErrors.salaryMax}</Err>}
              </div>
            </Field>
          </div>
        )}

        {/* ═══ STEP 5: REVIEW ═══ */}
        {step === 5 && (
          <div className="mt-8 space-y-6">
            {/* Preview */}
            <div className="border-[3px] border-lime/20 bg-bg-raised p-6 sm:p-8 space-y-4">
              <p className="text-xs text-lime">Preview</p>
              <h2 className="text-xl text-cream sm:text-2xl">{form.title}</h2>
              <p className="text-xs text-muted">
                {SENIORITY_LABELS[form.seniority]} · {ROLE_TYPE_LABELS[form.roleType]} · {LOCATION_TYPE_LABELS[form.locationType]}
                {form.locationType === "remote" && form.locationRestriction !== "worldwide" && ` (${LOCATION_RESTRICTION_LABELS[form.locationRestriction]})`}
                {form.locationCity && ` · ${form.locationCity}`}
              </p>
              <p className="text-sm text-lime">
                {form.salaryCurrency} {parseInt(form.salaryMin || "0").toLocaleString()}-{parseInt(form.salaryMax || "0").toLocaleString()}
                <span className="text-xs text-dim ml-1">{SALARY_PERIOD_LABELS[form.salaryPeriod]}</span>
              </p>
              <p className="text-xs text-muted">
                {form.contractTypes.map((c) => CONTRACT_LABELS[c]).join(", ")}
              </p>
              <div className="flex flex-wrap gap-2">
                {form.techTags.map((t) => (
                  <span key={t} className="border-[2px] px-2 py-0.5 text-xs" style={{ borderColor: "rgba(200,230,74,0.3)", color: "#c8e64a" }}>{t}</span>
                ))}
              </div>
              {form.benefits.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.benefits.map((b) => {
                    const benefit = BENEFITS_LIST.find((bl) => bl.id === b);
                    return <span key={b} className="text-xs text-muted normal-case">&#10003; {benefit?.label ?? b}</span>;
                  })}
                </div>
              )}
              <div className="border-t border-border/50 pt-4">
                <div className="tiptap text-sm text-cream-dark normal-case leading-relaxed" dangerouslySetInnerHTML={{ __html: form.description }} />
              </div>
              {(form.badgeResponse || form.badgeNoAi) && (
                <div className="flex gap-2">
                  {form.badgeResponse && <span className="border-[2px] border-lime/30 px-2 py-0.5 text-xs text-lime">Response Guaranteed</span>}
                  {form.badgeNoAi && <span className="border-[2px] border-lime/30 px-2 py-0.5 text-xs text-lime">No AI Screening</span>}
                </div>
              )}
            </div>

            {/* Founding company note */}
            <div className="border-[3px] border-[#fbbf24]/20 bg-[#fbbf24]/[0.03] p-5">
              <p className="text-xs text-[#fbbf24]">Founding Company</p>
              <p className="mt-1 text-xs text-muted normal-case">
                Your first listing is free for 30 days. It will be reviewed and published within 24 hours.
              </p>
            </div>

            {error && (
              <div className="border-[3px] border-red-500/30 bg-red-500/5 px-5 py-4">
                <p className="text-xs text-red-400 normal-case">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <button onClick={goBack} className="btn-press border-[3px] border-border px-6 py-4 text-sm text-cream cursor-pointer">
              Back
            </button>
          )}
          {step < 5 ? (
            <button
              onClick={goNext}
              disabled={!canProceed(step)}
              className="btn-press flex-1 bg-lime py-4 text-sm text-bg disabled:opacity-40 cursor-pointer"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-press flex-1 bg-lime py-4 text-sm text-bg disabled:opacity-50 cursor-pointer"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {submitting ? "Submitting..." : "Submit for Review (Free)"}
            </button>
          )}
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}

/* ─── Shared ─── */

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-sm text-cream">{label} {required && <span className="text-lime">*</span>}</span>
      {hint && <p className="mt-1 text-xs text-muted normal-case">{hint}</p>}
      {children}
    </div>
  );
}

function Sep() { return <div className="h-px bg-border/50" />; }
function Err({ children }: { children: React.ReactNode }) { return <p className="mt-1 text-xs text-red-400 normal-case">{children}</p>; }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="border-[3px] px-4 py-2 text-xs transition-colors cursor-pointer"
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

function isValidUrl(str: string): boolean {
  try { const url = new URL(str); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}
