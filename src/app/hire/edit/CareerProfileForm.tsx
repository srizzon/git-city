"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { CareerProfile, JobSeniority, JobContract } from "@/lib/jobs/types";
import { SENIORITY_LABELS, CONTRACT_LABELS } from "@/lib/jobs/constants";

const SENIORITY_OPTIONS: JobSeniority[] = ["junior", "mid", "senior", "staff", "lead"];
const CONTRACT_OPTIONS: JobContract[] = ["clt", "pj", "contract"];
const MAX_BIO = 500;
const MAX_SKILLS = 15;
const MAX_LINKS = 6;

// Auto-detect platform from URL
function detectLinkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const map: Record<string, string> = {
      "linkedin.com": "LinkedIn",
      "github.com": "GitHub",
      "twitter.com": "Twitter",
      "x.com": "X",
      "dribbble.com": "Dribbble",
      "behance.net": "Behance",
      "dev.to": "dev.to",
      "medium.com": "Medium",
      "youtube.com": "YouTube",
      "stackoverflow.com": "Stack Overflow",
      "codepen.io": "CodePen",
      "figma.com": "Figma",
      "notion.so": "Notion",
    };
    return map[host] ?? host;
  } catch {
    return "Link";
  }
}

interface LinkItem {
  label: string;
  url: string;
}

interface FormData {
  bio: string;
  skillTags: string[];
  seniority: JobSeniority;
  yearsExperience: string;
  contractTypes: JobContract[];
  webType: string;
  salaryCurrency: string;
  salaryMin: string;
  salaryMax: string;
  salaryVisible: boolean;
  languages: string;
  timezone: string;
  links: LinkItem[];
  openToWork: boolean;
}

const DEFAULT_FORM: FormData = {
  bio: "", skillTags: [], seniority: "mid", yearsExperience: "",
  contractTypes: [], webType: "both", salaryCurrency: "USD",
  salaryMin: "", salaryMax: "", salaryVisible: false,
  languages: "", timezone: "", links: [], openToWork: false,
};

function Toggle({ checked, onChange, label, sublabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; sublabel?: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div>
        <span className="text-sm text-cream normal-case">{label}</span>
        {sublabel && <p className="text-xs text-muted/40 normal-case mt-0.5">{sublabel}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 border-[3px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 ${
          checked ? "border-[#c8e64a] bg-[#c8e64a]/10" : "border-border bg-transparent"
        }`}
      >
        <span
          className={`block h-3 w-3 transition-all absolute top-[3px] ${
            checked ? "left-[22px] bg-[#c8e64a]" : "left-[3px] bg-muted"
          }`}
          style={{ backgroundColor: checked ? "#c8e64a" : "var(--color-muted)" }}
        />
      </button>
    </label>
  );
}

export default function CareerProfileForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const skillInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<FormData>) => setForm((prev) => ({ ...prev, ...partial }));

  // Auto-detect timezone
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) update({ timezone: tz });
    } catch { /* ignore */ }
  }, []);

  // Fetch username
  useEffect(() => {
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.github_login) setUsername(d.github_login);
    }).catch(() => {});
  }, []);

  // Load existing profile
  useEffect(() => {
    fetch("/api/career-profile")
      .then((r) => r.json())
      .then((d) => {
        const p: CareerProfile | null = d.profile;
        if (p) {
          setHasExisting(true);

          // Build links array from legacy columns + extra_links
          const links: LinkItem[] = [];
          if (p.link_portfolio) links.push({ label: "Portfolio", url: p.link_portfolio });
          if (p.link_linkedin) links.push({ label: "LinkedIn", url: p.link_linkedin });
          if (p.link_website) links.push({ label: "Website", url: p.link_website });
          const extras = (p as unknown as Record<string, unknown>).extra_links;
          if (Array.isArray(extras)) {
            for (const l of extras) {
              if (l && typeof l === "object" && "url" in l) {
                links.push({ label: (l as LinkItem).label || detectLinkLabel((l as LinkItem).url), url: (l as LinkItem).url });
              }
            }
          }

          setForm({
            bio: p.bio, skillTags: p.skills, seniority: p.seniority,
            yearsExperience: p.years_experience?.toString() ?? "",
            contractTypes: p.contract_type, webType: p.web_type,
            salaryCurrency: p.salary_currency ?? "USD",
            salaryMin: p.salary_min?.toString() ?? "",
            salaryMax: p.salary_max?.toString() ?? "",
            salaryVisible: p.salary_visible,
            languages: p.languages.join(", "),
            timezone: p.timezone ?? "",
            links,
            openToWork: p.open_to_work,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Skills
  const addSkill = (raw: string) => {
    const tag = raw.toLowerCase().trim();
    if (!tag || form.skillTags.includes(tag) || form.skillTags.length >= MAX_SKILLS) return;
    update({ skillTags: [...form.skillTags, tag] });
    setSkillInput("");
  };
  const removeSkill = (tag: string) => update({ skillTags: form.skillTags.filter((t) => t !== tag) });

  const toggleContract = (c: JobContract) => {
    update({
      contractTypes: form.contractTypes.includes(c)
        ? form.contractTypes.filter((x) => x !== c)
        : [...form.contractTypes, c],
    });
  };

  // Links
  function addLink() {
    if (form.links.length >= MAX_LINKS) return;
    update({ links: [...form.links, { label: "", url: "" }] });
  }
  function updateLink(index: number, field: "label" | "url", value: string) {
    const links = [...form.links];
    links[index] = { ...links[index], [field]: value };
    // Auto-detect label when URL changes
    if (field === "url" && value && !links[index].label) {
      links[index].label = detectLinkLabel(value);
    }
    update({ links });
  }
  function removeLink(index: number) {
    update({ links: form.links.filter((_, i) => i !== index) });
  }

  // Save
  async function save() {
    if (!form.bio.trim()) { setError("Bio is required"); return; }
    if (form.skillTags.length === 0) { setError("Add at least 1 skill"); return; }
    setSaving(true);
    setError("");

    // Split links into legacy columns + extras
    const validLinks = form.links.filter((l) => l.url.trim());
    let linkPortfolio: string | null = null;
    let linkLinkedin: string | null = null;
    let linkWebsite: string | null = null;
    const extraLinks: LinkItem[] = [];

    for (const l of validLinks) {
      const url = l.url.trim();
      if (!linkLinkedin && url.includes("linkedin.com")) {
        linkLinkedin = url;
      } else if (!linkPortfolio && (l.label.toLowerCase() === "portfolio" || (!linkPortfolio && !linkWebsite))) {
        linkPortfolio = url;
      } else if (!linkWebsite) {
        linkWebsite = url;
      } else {
        extraLinks.push({ label: l.label || detectLinkLabel(url), url });
      }
    }

    const body = {
      bio: form.bio.trim().slice(0, MAX_BIO),
      skills: form.skillTags.slice(0, MAX_SKILLS),
      seniority: form.seniority,
      years_experience: form.yearsExperience ? parseInt(form.yearsExperience) : null,
      contract_type: form.contractTypes,
      web_type: form.webType,
      salary_currency: form.salaryCurrency,
      salary_min: form.salaryMin ? parseInt(form.salaryMin) : null,
      salary_max: form.salaryMax ? parseInt(form.salaryMax) : null,
      salary_visible: form.salaryVisible,
      languages: form.languages.split(",").map((l) => l.trim()).filter(Boolean),
      timezone: form.timezone || null,
      link_portfolio: linkPortfolio,
      link_linkedin: linkLinkedin,
      link_website: linkWebsite,
      extra_links: extraLinks,
      open_to_work: form.openToWork,
    };

    try {
      const res = await fetch("/api/career-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved(true);
        setHasExisting(true);
        // Fetch username if we don't have it yet
        let login = username;
        if (!login) {
          try {
            const meRes = await fetch("/api/me");
            const me = await meRes.json();
            if (me?.github_login) login = me.github_login;
          } catch { /* ignore */ }
        }
        setTimeout(() => {
          if (returnTo) {
            window.location.href = returnTo;
          } else if (login) {
            window.location.href = `/hire/${login}`;
          } else {
            window.history.back();
          }
        }, 800);
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } finally {
      if (!saved) setSaving(false);
    }
  }

  async function deleteProfile() {
    if (!confirm("Delete your career profile? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch("/api/career-profile", { method: "DELETE" });
      if (username) window.location.href = `/hire/${username}`;
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
          <div className="h-3 w-20 animate-pulse bg-border" />
          <div className="mt-6 h-7 w-48 animate-pulse bg-border" />
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="h-3 w-16 animate-pulse bg-border" />
              <div className="h-10 w-full animate-pulse bg-border" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 animate-pulse bg-border" />
              <div className="h-24 w-full animate-pulse bg-border" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-12 animate-pulse bg-border" />
              <div className="flex gap-2">
                <div className="h-9 w-20 animate-pulse bg-border" />
                <div className="h-9 w-16 animate-pulse bg-border" />
                <div className="h-9 w-18 animate-pulse bg-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><div className="h-3 w-16 animate-pulse bg-border" /><div className="h-10 w-full animate-pulse bg-border" /></div>
              <div className="space-y-2"><div className="h-3 w-20 animate-pulse bg-border" /><div className="h-10 w-full animate-pulse bg-border" /></div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const inputClass = "w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50";
  const labelClass = "block text-xs text-muted font-pixel uppercase mb-1.5";
  const chipClass = (active: boolean) =>
    `cursor-pointer border-[3px] px-4 py-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 ${
      active ? "border-[#c8e64a] text-[#c8e64a] bg-[#c8e64a]/10" : "border-border text-muted hover:border-border-light"
    }`;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => window.history.back()} className="text-sm text-muted transition-colors hover:text-cream cursor-pointer">
            &lt; Back
          </button>
          {hasExisting && username && (
            <a href={`/hire/${username}`} className="text-sm text-muted transition-colors hover:text-cream">
              View profile &rarr;
            </a>
          )}
        </div>

        <h1 className="text-2xl text-cream mb-8">{hasExisting ? "Edit profile" : "Create profile"}</h1>

        {/* Return-to banner */}
        {returnTo && (
          <div className="mb-6 border-[3px] border-[#c8e64a]/20 bg-[#c8e64a]/5 p-4 flex items-center justify-between">
            <p className="text-xs text-cream normal-case">Create your profile to apply. You&apos;ll be redirected back after saving.</p>
            <a href={returnTo} className="shrink-0 text-xs text-muted transition-colors hover:text-cream cursor-pointer ml-4">Skip</a>
          </div>
        )}

        <div className="space-y-4">

          {/* ─── Status ─── */}
          <div className="border-[3px] border-border bg-bg-raised p-5">
            <Toggle checked={form.openToWork} onChange={(v) => update({ openToWork: v })} label="Open to work" sublabel="Visible on your profile" />
          </div>

          {/* ─── About ─── */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-5">
            <h2 className="text-xs text-muted/50 tracking-[0.15em]">About</h2>

            <div>
              <label htmlFor="bio" className={labelClass}>Bio *</label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={(e) => update({ bio: e.target.value })}
                placeholder="Tell recruiters about yourself, what you build, and what drives you..."
                maxLength={MAX_BIO}
                rows={12}
                className={`${inputClass} resize-y min-h-[200px]`}
              />
              <p className="mt-1 text-right text-[10px] text-muted/30">{form.bio.length}/{MAX_BIO}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Seniority *</label>
                <div className="flex flex-wrap gap-2">
                  {SENIORITY_OPTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => update({ seniority: s })} className={chipClass(form.seniority === s)}>
                      {SENIORITY_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="years" className={labelClass}>Years of experience</label>
                <input id="years" type="number" min={0} max={50} value={form.yearsExperience} onChange={(e) => update({ yearsExperience: e.target.value })} placeholder="e.g. 5" className={`${inputClass} w-24`} />
              </div>
            </div>
          </div>

          {/* ─── Skills ─── */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-3">
            <h2 className="text-xs text-muted/50 tracking-[0.15em]">
              Skills * <span className="text-muted/30 normal-case">({form.skillTags.length}/{MAX_SKILLS})</span>
            </h2>

            {form.skillTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.skillTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => removeSkill(tag)} className="cursor-pointer border-[2px] border-[#c8e64a]/30 px-2.5 py-1 text-xs text-[#c8e64a] transition-colors hover:border-red-400/50 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 group" aria-label={`Remove ${tag}`}>
                    {tag} <span className="text-muted/30 group-hover:text-red-400 ml-0.5">&times;</span>
                  </button>
                ))}
              </div>
            )}

            {form.skillTags.length < MAX_SKILLS && (
              <input
                ref={skillInputRef}
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && skillInput.trim()) { e.preventDefault(); addSkill(skillInput); }
                  if (e.key === "Backspace" && !skillInput && form.skillTags.length > 0) removeSkill(form.skillTags[form.skillTags.length - 1]);
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (pasted.includes(",") || pasted.includes("\n")) {
                    e.preventDefault();
                    const tags = pasted.split(/[,;\n\t]+/).map((t) => t.toLowerCase().trim()).filter(Boolean);
                    const unique = tags.filter((t) => !form.skillTags.includes(t));
                    update({ skillTags: [...form.skillTags, ...unique.slice(0, MAX_SKILLS - form.skillTags.length)] });
                    setSkillInput("");
                  }
                }}
                placeholder={form.skillTags.length === 0 ? "Type a skill and press Enter..." : "Add more..."}
                className={inputClass}
              />
            )}
          </div>

          {/* ─── Work preferences ─── */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-5">
            <h2 className="text-xs text-muted/50 tracking-[0.15em]">Work preferences</h2>

            <div>
              <label className={labelClass}>Contract type</label>
              <div className="flex flex-wrap gap-2">
                {CONTRACT_OPTIONS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleContract(c)} className={chipClass(form.contractTypes.includes(c))}>
                    {CONTRACT_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <Toggle checked={form.webType !== "web2"} onChange={(v) => update({ webType: v ? "both" : "web2" })} label="Open to Web3 / Crypto" />

            <div className="border-t border-border/30 pt-5">
              <label className={labelClass}>Desired salary /month</label>
              <div className="flex gap-2 mb-3">
                {["USD", "BRL", "EUR"].map((c) => (
                  <button key={c} type="button" onClick={() => update({ salaryCurrency: c })} className={chipClass(form.salaryCurrency === c)}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={form.salaryMin} onChange={(e) => update({ salaryMin: e.target.value })} placeholder="e.g. 3000" className={inputClass} />
                <input type="number" value={form.salaryMax} onChange={(e) => update({ salaryMax: e.target.value })} placeholder="e.g. 5000" className={inputClass} />
              </div>
              <div className="mt-3">
                <Toggle checked={form.salaryVisible} onChange={(v) => update({ salaryVisible: v })} label="Show salary on profile" sublabel="Recruiters can see your range" />
              </div>
            </div>
          </div>

          {/* ─── Details ─── */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-4">
            <h2 className="text-xs text-muted/50 tracking-[0.15em]">Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="languages" className={labelClass}>Languages</label>
                <input id="languages" type="text" value={form.languages} onChange={(e) => update({ languages: e.target.value })} placeholder="e.g. English, Portuguese" className={inputClass} />
              </div>
              <div>
                <label htmlFor="timezone" className={labelClass}>Timezone</label>
                <input id="timezone" type="text" value={form.timezone} onChange={(e) => update({ timezone: e.target.value })} placeholder="America/Sao_Paulo" className={inputClass} />
              </div>
            </div>
          </div>

          {/* ─── Links ─── */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs text-muted/50 tracking-[0.15em]">
                Links <span className="text-muted/30 normal-case">({form.links.length}/{MAX_LINKS})</span>
              </h2>
              {form.links.length < MAX_LINKS && (
                <button type="button" onClick={addLink} className="cursor-pointer text-xs text-muted transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm px-1">
                  + Add
                </button>
              )}
            </div>

            {form.links.length > 0 ? (
              <div className="space-y-3">
                {form.links.map((link, i) => (
                  <div key={i} className="border-[3px] border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={link.label}
                        onChange={(e) => updateLink(i, "label", e.target.value)}
                        placeholder="Label (auto-detected)"
                        maxLength={30}
                        className="bg-transparent text-sm text-cream placeholder:text-muted/30 focus-visible:outline-none w-full"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink(i)}
                        className="cursor-pointer shrink-0 ml-2 px-1 text-sm text-muted/40 transition-colors hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                        aria-label="Remove link"
                      >
                        &times;
                      </button>
                    </div>
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => updateLink(i, "url", e.target.value)}
                      onBlur={() => {
                        if (link.url && !link.label) {
                          updateLink(i, "label", detectLinkLabel(link.url));
                        }
                      }}
                      placeholder="https://..."
                      className="w-full bg-transparent text-xs text-muted normal-case placeholder:text-muted/30 focus-visible:outline-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" onClick={addLink} className="cursor-pointer w-full py-4 text-sm text-muted/40 normal-case transition-colors hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm">
                + Add your first link
              </button>
            )}
          </div>

          {/* ─── Save ─── */}
          {error && (
            <div className="border-[3px] border-red-400/30 bg-red-400/5 p-4">
              <p className="text-sm text-red-400 normal-case">{error}</p>
            </div>
          )}

          {saved && (
            <div className="border-[3px] border-[#c8e64a]/30 bg-[#c8e64a]/5 p-4">
              <p className="text-sm text-[#c8e64a] normal-case">Profile saved! Redirecting...</p>
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || saved}
            className="cursor-pointer w-full py-4 text-sm text-bg font-pixel uppercase disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
            style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #8fa832" }}
          >
            {saved ? "Saved!" : saving ? "Saving..." : "Save profile"}
          </button>

          {/* ─── Notification Settings ─── */}
          <a href="/settings" className="block text-center text-xs text-muted/40 normal-case transition-colors hover:text-cream mt-4">
            Manage job notification preferences &rarr;
          </a>

          {/* ─── Danger Zone ─── */}
          {hasExisting && (
            <div className="mt-8 border-[3px] border-red-400/10 p-5">
              <h2 className="text-xs text-red-400/40 tracking-[0.15em] mb-3">Danger zone</h2>
              <p className="text-xs text-muted/40 normal-case mb-4">
                Permanently delete your career profile. Your projects and experiences will also be removed. This cannot be undone.
              </p>
              <button
                onClick={deleteProfile}
                disabled={deleting}
                className="cursor-pointer border-[3px] border-red-400/20 px-5 py-2.5 text-xs text-red-400/60 font-pixel uppercase transition-colors hover:border-red-400/50 hover:text-red-400 hover:bg-red-400/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
              >
                {deleting ? "Deleting..." : "Delete profile"}
              </button>
            </div>
          )}
        </div>

        <div className="h-16" />
      </div>
    </main>
  );
}
