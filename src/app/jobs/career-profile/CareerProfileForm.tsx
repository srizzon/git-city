"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CareerProfile, JobSeniority, JobWeb, JobContract } from "@/lib/jobs/types";
import {
  SENIORITY_LABELS,
  CONTRACT_LABELS,
} from "@/lib/jobs/constants";

const SENIORITY_OPTIONS: JobSeniority[] = ["junior", "mid", "senior", "staff", "lead"];
const CONTRACT_OPTIONS: JobContract[] = ["clt", "pj", "contract"];

const STEPS = [
  { id: 1, label: "About You" },
  { id: 2, label: "Preferences" },
  { id: 3, label: "Details" },
] as const;

const LS_KEY = "gc_career_profile_draft";

interface FormData {
  bio: string;
  skillTags: string[];
  seniority: JobSeniority;
  yearsExperience: string;
  contractTypes: JobContract[];
  webType: JobWeb;
  salaryCurrency: string;
  salaryMin: string;
  salaryMax: string;
  salaryVisible: boolean;
  languages: string;
  timezone: string;
  linkPortfolio: string;
  linkLinkedin: string;
  linkWebsite: string;
  openToWork: boolean;
}

const DEFAULT_FORM: FormData = {
  bio: "",
  skillTags: [],
  seniority: "mid",
  yearsExperience: "",
  contractTypes: [],
  webType: "both",
  salaryCurrency: "USD",
  salaryMin: "",
  salaryMax: "",
  salaryVisible: false,
  languages: "",
  timezone: "",
  linkPortfolio: "",
  linkLinkedin: "",
  linkWebsite: "",
  openToWork: false,
};

export default function CareerProfileForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hasExisting, setHasExisting] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const skillInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<FormData>) => setForm((prev) => ({ ...prev, ...partial }));

  // ── Auto-detect timezone ──
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) update({ timezone: tz });
    } catch { /* ignore */ }
  }, []);

  // ── Fetch username ──
  useEffect(() => {
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.github_login) setUsername(d.github_login);
    }).catch(() => {});
  }, []);

  // ── Load existing profile from API, then overlay localStorage draft ──
  useEffect(() => {
    fetch("/api/career-profile")
      .then((r) => r.json())
      .then((d) => {
        const p: CareerProfile | null = d.profile;
        if (p) {
          setHasExisting(true);
          setForm({
            bio: p.bio,
            skillTags: p.skills,
            seniority: p.seniority,
            yearsExperience: p.years_experience?.toString() ?? "",
            contractTypes: p.contract_type,
            webType: p.web_type,
            salaryCurrency: p.salary_currency ?? "USD",
            salaryMin: p.salary_min?.toString() ?? "",
            salaryMax: p.salary_max?.toString() ?? "",
            salaryVisible: p.salary_visible,
            languages: p.languages.join(", "),
            timezone: p.timezone ?? "",
            linkPortfolio: p.link_portfolio ?? "",
            linkLinkedin: p.link_linkedin ?? "",
            linkWebsite: p.link_website ?? "",
            openToWork: p.open_to_work,
          });
        } else {
          // No existing profile — check localStorage for unsaved draft
          try {
            const saved = localStorage.getItem(LS_KEY);
            if (saved) setForm(JSON.parse(saved));
          } catch { /* ignore */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Save draft to localStorage on every change ──
  useEffect(() => {
    if (!loading) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(form)); } catch { /* ignore */ }
    }
  }, [form, loading]);

  // ── Skills ──
  const addSkill = (raw: string) => {
    const tag = raw.toLowerCase().trim();
    if (!tag || form.skillTags.includes(tag) || form.skillTags.length >= 20) return;
    update({ skillTags: [...form.skillTags, tag] });
    setSkillInput("");
  };
  const addMultipleSkills = (raw: string) => {
    const tags = raw.split(/[,;\n\t]+/).map((t) => t.toLowerCase().trim()).filter(Boolean);
    const unique = tags.filter((t) => !form.skillTags.includes(t));
    const toAdd = unique.slice(0, 20 - form.skillTags.length);
    if (toAdd.length > 0) {
      update({ skillTags: [...form.skillTags, ...toAdd] });
    }
    setSkillInput("");
  };
  const removeSkill = (tag: string) => update({ skillTags: form.skillTags.filter((t) => t !== tag) });
  const handleSkillKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(skillInput); }
    if (e.key === "Backspace" && !skillInput && form.skillTags.length > 0) removeSkill(form.skillTags[form.skillTags.length - 1]);
  };
  const handleSkillPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes(",") || pasted.includes("\n") || pasted.includes("\t") || pasted.includes(";")) {
      e.preventDefault();
      addMultipleSkills(pasted);
    }
  };

  const toggleContract = (c: JobContract) => {
    update({
      contractTypes: form.contractTypes.includes(c)
        ? form.contractTypes.filter((x) => x !== c)
        : [...form.contractTypes, c],
    });
  };

  // ── Validation ──
  function validateStep(s: number): Record<string, string> {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.bio.trim()) errs.bio = "Write a short bio";
      if (form.bio.length > 500) errs.bio = "Max 500 characters";
      if (form.skillTags.length === 0) errs.skills = "Add at least 1 skill";
    }
    // Steps 2 and 3 have no required fields
    return errs;
  }

  function canProceed(s: number): boolean {
    return Object.keys(validateStep(s)).length === 0;
  }

  function goNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0 });
  }

  function goBack() {
    setFieldErrors({});
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0 });
  }

  function goToStep(s: number) {
    if (s > step) return;
    setFieldErrors({});
    setStep(s);
    window.scrollTo({ top: 0 });
  }

  // ── Save ──
  const handleSave = async () => {
    // Validate step 1 fields (the only required ones)
    const errs = validateStep(1);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setStep(1);
      setError("Fill in required fields in Step 1");
      return;
    }

    setError("");
    setSaving(true);
    setSaved(false);

    const body = {
      skills: form.skillTags,
      seniority: form.seniority,
      bio: form.bio.trim(),
      web_type: form.webType,
      contract_type: form.contractTypes,
      years_experience: form.yearsExperience ? parseInt(form.yearsExperience) : null,
      salary_min: form.salaryMin ? parseInt(form.salaryMin) : null,
      salary_max: form.salaryMax ? parseInt(form.salaryMax) : null,
      salary_currency: form.salaryCurrency,
      salary_visible: form.salaryVisible,
      languages: form.languages.split(",").map((l) => l.trim()).filter(Boolean),
      timezone: form.timezone || null,
      link_portfolio: form.linkPortfolio || null,
      link_linkedin: form.linkLinkedin || null,
      link_website: form.linkWebsite || null,
      open_to_work: form.openToWork,
    };

    const res = await fetch("/api/career-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      localStorage.removeItem(LS_KEY);

      // If we came from a job listing, go back there
      if (returnTo) {
        window.location.href = returnTo;
        return;
      }

      // Otherwise, redirect to view the profile
      if (username) {
        window.location.href = `/dev/${username}/career?saved=true${!hasExisting ? "&first=true" : ""}`;
        return;
      }

      // Fallback
      setSaved(true);
      setHasExisting(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete your career profile? This cannot be undone.")) return;
    setDeleting(true);
    await fetch("/api/career-profile", { method: "DELETE" });
    setHasExisting(false);
    setDeleting(false);
    setForm(DEFAULT_FORM);
    setStep(1);
    localStorage.removeItem(LS_KEY);
  };

  const inputClass = "w-full border-[3px] border-border bg-bg px-4 py-3 text-sm text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime";

  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
          <div className="h-4 w-24 animate-pulse bg-border" />
          <div className="mt-6 h-8 w-48 animate-pulse bg-border" />
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-8">
            <div className="h-5 w-2/3 animate-pulse bg-border" />
            <div className="mt-4 h-20 w-full animate-pulse bg-border" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Nav */}
        <Link href="/jobs" className="text-sm text-muted transition-colors hover:text-cream">
          &lt; Back to jobs
        </Link>

        {/* Return-to context banner */}
        {returnTo && (
          <div className="mt-6 border-[3px] border-lime/20 bg-lime/5 p-4 flex items-center justify-between">
            <p className="text-xs text-cream normal-case">
              Create your profile to apply. You&apos;ll be sent back to the job after saving.
            </p>
            <Link href={returnTo} className="shrink-0 text-xs text-muted transition-colors hover:text-cream cursor-pointer ml-4">
              Skip
            </Link>
          </div>
        )}

        {/* Title */}
        <div className="mt-6 flex items-center justify-between">
          <h1 className="text-2xl text-lime sm:text-3xl">Career Profile</h1>
          {hasExisting && username && (
            <Link
              href={`/dev/${username}/career`}
              className="btn-press border-[3px] border-border px-4 py-2 text-xs text-cream transition-colors hover:border-border-light cursor-pointer"
            >
              View my profile
            </Link>
          )}
        </div>
        <p className="mt-3 text-sm text-cream-dark normal-case leading-relaxed">
          Companies see this when you apply to a job.
          {!hasExisting && <span className="text-lime"> +500 XP</span>}
        </p>

        {/* ── Progress indicator ── */}
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
          <p className="mt-3 text-xs text-muted sm:hidden">
            Step {step} of {STEPS.length} — {STEPS[step - 1].label}
          </p>
        </nav>

        {/* ── Open to Work toggle (always visible) ── */}
        <button
          onClick={() => update({ openToWork: !form.openToWork })}
          role="switch"
          aria-checked={form.openToWork}
          className="mt-8 flex w-full items-center justify-between border-[3px] p-5 transition-colors"
          style={{
            borderColor: form.openToWork ? "#c8e64a" : "var(--color-border)",
            backgroundColor: form.openToWork ? "rgba(200,230,74,0.06)" : "var(--color-bg-raised)",
          }}
        >
          <div className="text-left">
            <span className="text-base text-cream">Open to work</span>
            <p className="mt-1 text-xs text-muted normal-case">Companies with active listings can find your profile</p>
          </div>
          <div
            className="flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors"
            style={{ backgroundColor: form.openToWork ? "#c8e64a" : "var(--color-border)" }}
          >
            <div
              className="h-6 w-6 rounded-full bg-bg transition-transform"
              style={{ transform: form.openToWork ? "translateX(20px)" : "translateX(0)" }}
            />
          </div>
        </button>

        {/* ═══════ STEP 1: ABOUT YOU ═══════ */}
        {step === 1 && (
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            {/* Bio */}
            <div>
              <label htmlFor="cp-bio" className="text-sm text-cream">
                What do you do? <span className="text-lime">*</span>
              </label>
              <p className="mt-1 text-xs text-muted normal-case">
                A short intro — what you build and what you&apos;re looking for
              </p>
              <textarea
                id="cp-bio"
                value={form.bio}
                onChange={(e) => update({ bio: e.target.value })}
                maxLength={500}
                rows={4}
                autoFocus
                placeholder="Fullstack dev, 5 years with React and Node. Looking for remote roles at early-stage startups."
                className={`${inputClass} mt-3 resize-none`}
                style={{ fontFamily: "inherit" }}
              />
              <div className="mt-1 flex justify-between text-xs">
                {fieldErrors.bio ? <span className="text-red-400 normal-case">{fieldErrors.bio}</span> : <span />}
                <span className="text-dim">{form.bio.length}/500</span>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Skills */}
            <div>
              <label htmlFor="cp-skills" className="text-sm text-cream">
                Skills <span className="text-lime">*</span>
              </label>
              <p className="mt-1 text-xs text-muted normal-case">
                Type and press Enter, or paste a comma-separated list. Matched against job requirements.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  id="cp-skills"
                  ref={skillInputRef}
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  onPaste={handleSkillPaste}
                  placeholder={form.skillTags.length === 0 ? "react, typescript, node..." : "add another..."}
                  className={`${inputClass} flex-1`}
                  style={{ fontFamily: "inherit" }}
                  disabled={form.skillTags.length >= 20}
                />
                <button
                  onClick={() => { addSkill(skillInput); skillInputRef.current?.focus(); }}
                  disabled={!skillInput.trim() || form.skillTags.length >= 20}
                  className="btn-press shrink-0 border-[3px] border-border px-5 text-sm text-cream disabled:opacity-30"
                >
                  Add
                </button>
              </div>
              {form.skillTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.skillTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => removeSkill(tag)}
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
              {fieldErrors.skills && <p className="mt-1 text-xs text-red-400 normal-case">{fieldErrors.skills}</p>}
              <p className="mt-1 text-xs" style={{ color: form.skillTags.length >= 18 ? "#c8e64a" : "var(--color-dim)" }}>
                {form.skillTags.length}/20
              </p>
            </div>

            <div className="h-px bg-border/50" />

            {/* Seniority */}
            <div>
              <span className="text-sm text-cream">Level <span className="text-lime">*</span></span>
              <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Seniority level">
                {SENIORITY_OPTIONS.map((s) => (
                  <Chip key={s} active={form.seniority === s} onClick={() => update({ seniority: s })}>
                    {SENIORITY_LABELS[s]}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ STEP 2: PREFERENCES ═══════ */}
        {step === 2 && (
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            {/* Experience */}
            <div className="flex items-center gap-4">
              <label htmlFor="cp-exp" className="text-sm text-cream shrink-0">Experience</label>
              <div className="flex items-center gap-3">
                <input
                  id="cp-exp"
                  type="number"
                  min="0"
                  max="50"
                  value={form.yearsExperience}
                  onChange={(e) => update({ yearsExperience: e.target.value })}
                  placeholder="0"
                  autoFocus
                  className="w-20 border-[3px] border-border bg-bg px-3 py-3 text-center text-sm text-cream outline-none placeholder:text-dim focus-visible:border-lime"
                  style={{ fontFamily: "inherit" }}
                />
                <span className="text-sm text-muted">years</span>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Contract */}
            <div>
              <span className="text-sm text-cream">Contract</span>
              <p className="mt-1 text-xs text-muted normal-case">Select all that apply</p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Contract types">
                {CONTRACT_OPTIONS.map((c) => (
                  <Chip key={c} active={form.contractTypes.includes(c)} onClick={() => toggleContract(c)}>
                    {CONTRACT_LABELS[c]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Web3 toggle */}
            <button
              onClick={() => update({ webType: form.webType !== "web2" ? "web2" : "both" })}
              role="switch"
              aria-checked={form.webType !== "web2"}
              className="flex w-full items-center justify-between"
            >
              <div className="text-left">
                <span className="text-sm text-cream">Open to Web3 / Crypto</span>
                <p className="mt-1 text-xs text-muted normal-case">Blockchain, DeFi, and crypto projects</p>
              </div>
              <div
                className="flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors ml-4"
                style={{ backgroundColor: form.webType !== "web2" ? "#c8e64a" : "var(--color-border)" }}
              >
                <div
                  className="h-6 w-6 rounded-full bg-bg transition-transform"
                  style={{ transform: form.webType !== "web2" ? "translateX(20px)" : "translateX(0)" }}
                />
              </div>
            </button>

            <div className="h-px bg-border/50" />

            {/* Salary */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cream">Desired salary</span>
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
              <p className="mt-1 text-xs text-muted normal-case">Optional. Only visible if you choose to show it.</p>
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
              <label htmlFor="cp-salary-vis" className="mt-3 flex items-center gap-3 cursor-pointer">
                <input
                  id="cp-salary-vis"
                  type="checkbox"
                  checked={form.salaryVisible}
                  onChange={(e) => update({ salaryVisible: e.target.checked })}
                  className="accent-lime h-5 w-5 shrink-0"
                />
                <span className="text-sm text-cream-dark normal-case">Show salary on my profile</span>
              </label>
            </div>
          </div>
        )}

        {/* ═══════ STEP 3: DETAILS ═══════ */}
        {step === 3 && (
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-8">
            {/* Languages + Timezone */}
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <label htmlFor="cp-langs" className="text-sm text-cream">Languages</label>
                <input
                  id="cp-langs"
                  value={form.languages}
                  onChange={(e) => update({ languages: e.target.value })}
                  placeholder="English, Portuguese"
                  autoFocus
                  className={`${inputClass} mt-3`}
                  style={{ fontFamily: "inherit" }}
                />
              </div>
              <div>
                <label htmlFor="cp-tz" className="text-sm text-cream">Timezone</label>
                <input
                  id="cp-tz"
                  value={form.timezone}
                  onChange={(e) => update({ timezone: e.target.value })}
                  placeholder="America/Sao_Paulo"
                  className={`${inputClass} mt-3`}
                  style={{ fontFamily: "inherit" }}
                />
                <p className="mt-1 text-xs text-dim normal-case">Auto-detected</p>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Links */}
            <div>
              <span className="text-sm text-cream">Links</span>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="cp-portfolio" className="text-xs text-muted">Portfolio</label>
                  <input
                    id="cp-portfolio"
                    value={form.linkPortfolio}
                    onChange={(e) => update({ linkPortfolio: e.target.value })}
                    placeholder="https://yoursite.com"
                    className={`${inputClass} mt-1`}
                    style={{ fontFamily: "inherit" }}
                  />
                </div>
                <div>
                  <label htmlFor="cp-linkedin" className="text-xs text-muted">LinkedIn</label>
                  <input
                    id="cp-linkedin"
                    value={form.linkLinkedin}
                    onChange={(e) => update({ linkLinkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/you"
                    className={`${inputClass} mt-1`}
                    style={{ fontFamily: "inherit" }}
                  />
                </div>
                <div>
                  <label htmlFor="cp-website" className="text-xs text-muted">Website</label>
                  <input
                    id="cp-website"
                    value={form.linkWebsite}
                    onChange={(e) => update({ linkWebsite: e.target.value })}
                    placeholder="https://blog.you.dev"
                    className={`${inputClass} mt-1`}
                    style={{ fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mt-6 border-[3px] border-red-500/30 bg-red-500/10 px-5 py-4">
            <p className="text-sm text-red-400 normal-case">{error}</p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <button onClick={goBack} className="btn-press border-[3px] border-border px-6 py-4 text-sm text-cream">
              Back
            </button>
          )}
          {step < 3 ? (
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
              onClick={handleSave}
              disabled={saving}
              className="btn-press flex-1 bg-lime py-4 text-sm text-bg disabled:opacity-50"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {saving ? "Saving..." : saved ? "Saved!" : hasExisting ? "Update Profile" : "Create Profile"}
            </button>
          )}
        </div>

        {saved && (
          <p className="mt-3 text-center text-sm text-lime">
            {hasExisting ? "Profile updated." : "Profile created! +500 XP"}
          </p>
        )}

        {hasExisting && step === 3 && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="mt-4 w-full py-3 text-xs text-dim transition-colors hover:text-red-400 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete career profile"}
          </button>
        )}

        <div className="h-12" />
      </div>
    </main>
  );
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
