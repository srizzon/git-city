"use client";

import { useState } from "react";
import type { JobCompanyProfileAdmin } from "@/lib/jobs/types";
import type { JobListingAdmin } from "./job-row";
import {
  ROLE_TYPE_LABELS,
  SENIORITY_LABELS,
  CONTRACT_LABELS,
  WEB_TYPE_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_RESTRICTION_LABELS,
  SALARY_PERIOD_LABELS,
  BENEFITS_LIST,
  JOB_TIERS,
} from "@/lib/jobs/constants";

interface JobFormProps {
  mode: "create" | "edit";
  listing?: JobListingAdmin;
  companies: JobCompanyProfileAdmin[];
  onSave: () => void;
  onClose: () => void;
  addToast: (type: "success" | "error", message: string) => void;
}

export function JobForm({ mode, listing, companies, onSave, onClose, addToast }: JobFormProps) {
  // Company
  const [companyId, setCompanyId] = useState(listing?.company_id ?? companies[0]?.id ?? "");

  // Basic
  const [title, setTitle] = useState(listing?.title ?? "");
  const [roleType, setRoleType] = useState<string>(listing?.role_type ?? "fullstack");
  const [seniority, setSeniority] = useState<string>(listing?.seniority ?? "mid");
  const [contractType, setContractType] = useState<string>(listing?.contract_type ?? "fulltime");
  const [webType, setWebType] = useState<string>(listing?.web_type ?? "web2");

  // Salary
  const [salaryMin, setSalaryMin] = useState(String(listing?.salary_min ?? ""));
  const [salaryMax, setSalaryMax] = useState(String(listing?.salary_max ?? ""));
  const [salaryCurrency, setSalaryCurrency] = useState(listing?.salary_currency ?? "USD");
  const [salaryPeriod, setSalaryPeriod] = useState<string>(listing?.salary_period ?? "monthly");

  // Location
  const [locationType, setLocationType] = useState<string>(listing?.location_type ?? "remote");
  const [locationRestriction, setLocationRestriction] = useState<string>(listing?.location_restriction ?? "worldwide");
  const [locationCity, setLocationCity] = useState(listing?.location_city ?? "");
  const [locationTimezone, setLocationTimezone] = useState(listing?.location_timezone ?? "");

  // Content
  const [description, setDescription] = useState(listing?.description ?? "");
  const [techStackInput, setTechStackInput] = useState(listing?.tech_stack?.join(", ") ?? "");
  const [benefits, setBenefits] = useState<string[]>(listing?.benefits ?? []);
  const [applyUrl, setApplyUrl] = useState(listing?.apply_url ?? "");
  const [howToApply, setHowToApply] = useState(listing?.how_to_apply ?? "");

  // Badges
  const [responseGuaranteed, setResponseGuaranteed] = useState(listing?.badge_response_guaranteed ?? false);
  const [noAiScreening, setNoAiScreening] = useState(listing?.badge_no_ai_screening ?? false);

  // Admin
  const [tier, setTier] = useState<string>(listing?.tier ?? "free");
  const [language, setLanguage] = useState(listing?.language ?? "en");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBenefit = (id: string) => {
    setBenefits((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const handleSubmit = async (publishNow: boolean) => {
    setSaving(true);
    setError(null);

    const techStack = techStackInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (mode === "create") {
      const body = {
        company_id: companyId,
        title,
        description,
        salary_min: Number(salaryMin),
        salary_max: Number(salaryMax),
        salary_currency: salaryCurrency,
        salary_period: salaryPeriod,
        role_type: roleType,
        tech_stack: techStack,
        seniority,
        contract_type: contractType,
        web_type: webType,
        apply_url: applyUrl,
        location_type: locationType,
        location_restriction: locationRestriction,
        location_city: locationCity || null,
        location_timezone: locationTimezone || null,
        benefits,
        how_to_apply: howToApply || null,
        language,
        badge_response_guaranteed: responseGuaranteed,
        badge_no_ai_screening: noAiScreening,
        status: publishNow ? "active" : "draft",
        tier,
      };

      try {
        const res = await fetch("/api/admin/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create");
          setSaving(false);
          return;
        }
        addToast("success", publishNow ? "Listing published" : "Draft saved");
        onSave();
      } catch {
        setError("Failed to create");
      }
    } else {
      // Edit mode
      const fields: Record<string, unknown> = {
        company_id: companyId,
        title,
        description,
        salary_min: Number(salaryMin),
        salary_max: Number(salaryMax),
        salary_currency: salaryCurrency,
        salary_period: salaryPeriod,
        role_type: roleType,
        tech_stack: techStack,
        seniority,
        contract_type: contractType,
        web_type: webType,
        apply_url: applyUrl,
        location_type: locationType,
        location_restriction: locationRestriction,
        location_city: locationCity || null,
        location_timezone: locationTimezone || null,
        benefits,
        how_to_apply: howToApply || null,
        language,
        badge_response_guaranteed: responseGuaranteed,
        badge_no_ai_screening: noAiScreening,
        tier,
      };

      try {
        const res = await fetch(`/api/admin/jobs/${listing!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", fields }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to save");
          setSaving(false);
          return;
        }
        addToast("success", "Listing updated");
        onSave();
      } catch {
        setError("Failed to save");
      }
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-bg border-[3px] border-border no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-5 py-3">
          <h2 className="text-sm text-cream">{mode === "create" ? "CREATE LISTING" : "EDIT LISTING"}</h2>
          <button onClick={onClose} className="text-xs text-dim hover:text-cream cursor-pointer">CLOSE</button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">{error}</div>
          )}

          {/* Company */}
          <Section title="COMPANY">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Section>

          {/* Basic Info */}
          <Section title="BASIC INFO">
            <div className="space-y-3">
              <Field label="Title *">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  placeholder="Senior Frontend Engineer"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role Type">
                  <Select value={roleType} onChange={setRoleType} options={ROLE_TYPE_LABELS} />
                </Field>
                <Field label="Seniority">
                  <Select value={seniority} onChange={setSeniority} options={SENIORITY_LABELS} />
                </Field>
                <Field label="Contract">
                  <Select value={contractType} onChange={setContractType} options={CONTRACT_LABELS} />
                </Field>
                <Field label="Web Type">
                  <Select value={webType} onChange={setWebType} options={WEB_TYPE_LABELS} />
                </Field>
              </div>
            </div>
          </Section>

          {/* Salary */}
          <Section title="SALARY">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min *">
                <input
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  placeholder="3000"
                />
              </Field>
              <Field label="Max *">
                <input
                  type="number"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  placeholder="6000"
                />
              </Field>
              <Field label="Currency">
                <input
                  type="text"
                  value={salaryCurrency}
                  onChange={(e) => setSalaryCurrency(e.target.value.toUpperCase())}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  placeholder="USD"
                  maxLength={5}
                />
              </Field>
              <Field label="Pay Period">
                <Select value={salaryPeriod} onChange={setSalaryPeriod} options={SALARY_PERIOD_LABELS} />
              </Field>
            </div>
          </Section>

          {/* Location */}
          <Section title="LOCATION">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Work Model">
                <Select value={locationType} onChange={setLocationType} options={LOCATION_TYPE_LABELS} />
              </Field>
              <Field label="Region">
                <Select value={locationRestriction} onChange={setLocationRestriction} options={LOCATION_RESTRICTION_LABELS} />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={locationCity}
                  onChange={(e) => setLocationCity(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  placeholder="Optional"
                />
              </Field>
              <Field label="Timezone">
                <input
                  type="text"
                  value={locationTimezone}
                  onChange={(e) => setLocationTimezone(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  placeholder="UTC-3"
                />
              </Field>
            </div>
          </Section>

          {/* Description */}
          <Section title="DESCRIPTION">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50 resize-none font-mono"
              placeholder="Job description (HTML supported)..."
            />
            <p className="mt-1 text-[10px] text-dim">HTML tags allowed: p, br, strong, em, a, ul, ol, li, h1-h3, blockquote, code, pre</p>
          </Section>

          {/* Tech Stack */}
          <Section title="TECH STACK">
            <input
              type="text"
              value={techStackInput}
              onChange={(e) => setTechStackInput(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
              placeholder="react, typescript, node.js, postgresql"
            />
            <p className="mt-1 text-[10px] text-dim">Comma-separated, max 15 tags</p>
          </Section>

          {/* Benefits */}
          <Section title="BENEFITS">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {BENEFITS_LIST.map((b) => (
                <label
                  key={b.id}
                  className={`flex cursor-pointer items-center gap-2 border px-2.5 py-1.5 text-xs transition-colors ${
                    benefits.includes(b.id)
                      ? "border-lime/30 text-lime bg-lime/5"
                      : "border-border text-muted hover:text-cream"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={benefits.includes(b.id)}
                    onChange={() => toggleBenefit(b.id)}
                    className="sr-only"
                  />
                  {b.label}
                </label>
              ))}
            </div>
          </Section>

          {/* Apply */}
          <Section title="APPLICATION">
            <Field label="Apply URL *">
              <input
                type="url"
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
                className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                placeholder="https://example.com/apply"
              />
            </Field>
            <Field label="How to Apply">
              <textarea
                value={howToApply}
                onChange={(e) => setHowToApply(e.target.value)}
                rows={3}
                className="mt-3 w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50 resize-none"
                placeholder="Optional instructions..."
              />
            </Field>
          </Section>

          {/* Badges */}
          <Section title="BADGES">
            <div className="flex gap-3">
              <label className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs transition-colors ${responseGuaranteed ? "border-lime/30 text-lime" : "border-border text-muted"}`}>
                <input type="checkbox" checked={responseGuaranteed} onChange={() => setResponseGuaranteed(!responseGuaranteed)} className="sr-only" />
                Response Guaranteed
              </label>
              <label className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs transition-colors ${noAiScreening ? "border-lime/30 text-lime" : "border-border text-muted"}`}>
                <input type="checkbox" checked={noAiScreening} onChange={() => setNoAiScreening(!noAiScreening)} className="sr-only" />
                No AI Screening
              </label>
            </div>
          </Section>

          {/* Admin Controls */}
          <Section title="ADMIN">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tier">
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                >
                  {Object.entries(JOB_TIERS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} (${v.price_usd_cents / 100})</option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                >
                  <option value="en">English</option>
                  <option value="pt">Portuguese</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              onClick={onClose}
              className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream"
            >
              CANCEL
            </button>
            {mode === "create" && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={saving}
                className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream disabled:opacity-40"
              >
                SAVE DRAFT
              </button>
            )}
            <button
              onClick={() => handleSubmit(mode === "create")}
              disabled={saving}
              className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10 disabled:opacity-40"
            >
              {saving ? "SAVING..." : mode === "create" ? "PUBLISH NOW" : "SAVE CHANGES"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-dim mb-2">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-dim mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
    >
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );
}
