"use client";

import { useState, useEffect, useRef } from "react";
import type { PortfolioExperience } from "@/lib/portfolio/types";

interface Props {
  experiences: PortfolioExperience[];
  isOwner: boolean;
}

interface FormData {
  company: string;
  role: string;
  impact_line: string;
  start_year: string;
  start_month: string;
  end_year: string;
  end_month: string;
  is_current: boolean;
}

const EMPTY_FORM: FormData = {
  company: "", role: "", impact_line: "",
  start_year: "", start_month: "", end_year: "", end_month: "",
  is_current: false,
};

const MONTHS = [
  { value: "", label: "Month" },
  { value: "1", label: "Jan" }, { value: "2", label: "Feb" }, { value: "3", label: "Mar" },
  { value: "4", label: "Apr" }, { value: "5", label: "May" }, { value: "6", label: "Jun" },
  { value: "7", label: "Jul" }, { value: "8", label: "Aug" }, { value: "9", label: "Sep" },
  { value: "10", label: "Oct" }, { value: "11", label: "Nov" }, { value: "12", label: "Dec" },
];

function formatPeriod(exp: PortfolioExperience): string {
  if (exp.period) return exp.period;
  if (!exp.start_year) return "";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const start = exp.start_month ? `${monthNames[exp.start_month - 1]} ${exp.start_year}` : `${exp.start_year}`;
  if (exp.is_current) return `${start} – Present`;
  if (exp.end_year) {
    const end = exp.end_month ? `${monthNames[exp.end_month - 1]} ${exp.end_year}` : `${exp.end_year}`;
    return `${start} – ${end}`;
  }
  return start;
}

function calcDuration(exp: PortfolioExperience): string {
  if (!exp.start_year) return "";
  const startDate = new Date(exp.start_year, (exp.start_month ?? 1) - 1);
  const endDate = exp.is_current ? new Date() : exp.end_year ? new Date(exp.end_year, (exp.end_month ?? 12) - 1) : null;
  if (!endDate) return "";
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  if (months < 1) return "< 1 mo";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} yr ${rem} mo` : `${years} yr`;
}

function yearOptions(): string[] {
  const current = new Date().getFullYear();
  const years: string[] = [];
  for (let y = current; y >= current - 30; y--) years.push(String(y));
  return years;
}

const YEARS = yearOptions();

export default function PortfolioExperiences({ experiences: initialExperiences, isOwner }: Props) {
  const [experiences, setExperiences] = useState(initialExperiences);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setPanelOpen(false);
    setEditingId(null);
    setError("");
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!panelOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (panelOpen && panelRef.current) {
      const first = panelRef.current.querySelector<HTMLElement>("input, select");
      first?.focus();
    }
  }, [panelOpen]);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setPanelOpen(true);
  }

  function openEdit(exp: PortfolioExperience) {
    setEditingId(exp.id);
    setForm({
      company: exp.company,
      role: exp.role,
      impact_line: exp.impact_line ?? "",
      start_year: exp.start_year ? String(exp.start_year) : "",
      start_month: exp.start_month ? String(exp.start_month) : "",
      end_year: exp.end_year ? String(exp.end_year) : "",
      end_month: exp.end_month ? String(exp.end_month) : "",
      is_current: exp.is_current,
    });
    setError("");
    setPanelOpen(true);
  }

  async function save() {
    if (!form.company.trim() || !form.role.trim()) return;
    if (!form.start_year) { setError("Start year is required"); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        company: form.company.trim(),
        role: form.role.trim(),
        impact_line: form.impact_line.trim() || null,
        start_year: form.start_year,
        start_month: form.start_month || null,
        end_year: form.is_current ? null : (form.end_year || null),
        end_month: form.is_current ? null : (form.end_month || null),
        is_current: form.is_current,
      };

      if (editingId) {
        const res = await fetch(`/api/portfolio/experiences/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
        if (data.experience) setExperiences((prev) => prev.map((e) => (e.id === editingId ? data.experience : e)));
      } else {
        const res = await fetch("/api/portfolio/experiences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
        if (data.experience) setExperiences((prev) => [...prev, data.experience]);
      }
      close();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setSaving(true);
    try {
      await fetch(`/api/portfolio/experiences/${editingId}`, { method: "DELETE" });
      setExperiences((prev) => prev.filter((e) => e.id !== editingId));
      close();
    } finally {
      setSaving(false);
    }
  }

  // Sort by start date descending (most recent first)
  const sorted = [...experiences].sort((a, b) => {
    const aDate = (a.start_year ?? 0) * 100 + (a.start_month ?? 0);
    const bDate = (b.start_year ?? 0) * 100 + (b.start_month ?? 0);
    return bDate - aDate;
  });

  if (!isOwner && experiences.length === 0) return null;

  const selectClass = "bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 cursor-pointer appearance-none";
  const inputClass = "w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50";

  return (
    <>
      <div className="border-[3px] border-border bg-bg-raised p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs text-muted/50 tracking-[0.15em]">Experience</h2>
          {isOwner && (
            <button
              ref={triggerRef}
              onClick={openNew}
              className="cursor-pointer text-xs text-muted transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm px-1"
            >
              + Add
            </button>
          )}
        </div>

        {sorted.length > 0 ? (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border/50" />

            <div className="space-y-6">
              {sorted.map((exp) => {
                const period = formatPeriod(exp);
                const duration = calcDuration(exp);
                return (
                  <div
                    key={exp.id}
                    role={isOwner ? "button" : undefined}
                    tabIndex={isOwner ? 0 : undefined}
                    onClick={isOwner ? () => openEdit(exp) : undefined}
                    onKeyDown={isOwner ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(exp); } } : undefined}
                    className={`group relative pl-7 ${isOwner ? "cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 pl-9 py-2 -my-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm" : ""}`}
                  >
                    {/* Timeline dot */}
                    <div className={`absolute left-0 top-1.5 h-[11px] w-[11px] border-[3px] ${exp.is_current ? "border-[#c8e64a] bg-[#c8e64a]/20" : "border-border bg-bg"}`} style={isOwner ? { left: "7px" } : undefined} />

                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-cream">{exp.company}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {period && <span className="text-xs text-muted/60">{period}</span>}
                        {isOwner && (
                          <span className="text-xs text-muted/30 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">Edit</span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted">{exp.role}</p>
                    {duration && <p className="text-[10px] text-muted/40">{duration}</p>}
                    {exp.impact_line && (
                      <p className="mt-1.5 text-xs text-muted/60 normal-case leading-relaxed">{exp.impact_line}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : isOwner ? (
          <button
            onClick={openNew}
            className="cursor-pointer w-full py-6 text-sm text-muted/40 normal-case transition-colors hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm"
          >
            + Add your first experience
          </button>
        ) : null}
      </div>

      {/* ─── Slide-over Panel ─── */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? "Edit experience" : "New experience"}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            ref={panelRef}
            className="relative w-full max-w-md bg-bg border-l-[3px] border-border overflow-y-auto animate-[slide-in-right_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg text-cream font-pixel uppercase">
                  {editingId ? "Edit experience" : "New experience"}
                </h2>
                <button
                  onClick={close}
                  aria-label="Close panel"
                  className="cursor-pointer text-muted hover:text-cream text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm p-1"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-5">
                {/* Company */}
                <div>
                  <label htmlFor="exp-company" className="block text-xs text-muted font-pixel uppercase mb-1.5">Company *</label>
                  <input id="exp-company" type="text" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Acme Corp" maxLength={120} className={inputClass} />
                </div>

                {/* Role */}
                <div>
                  <label htmlFor="exp-role" className="block text-xs text-muted font-pixel uppercase mb-1.5">Role *</label>
                  <input id="exp-role" type="text" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Senior Software Engineer" maxLength={120} className={inputClass} />
                </div>

                {/* Start date */}
                <div>
                  <label className="block text-xs text-muted font-pixel uppercase mb-1.5">Start date *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <select value={form.start_month} onChange={(e) => setForm((f) => ({ ...f, start_month: e.target.value }))} className={selectClass}>
                      {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select value={form.start_year} onChange={(e) => setForm((f) => ({ ...f, start_year: e.target.value }))} className={selectClass}>
                      <option value="">Year *</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {/* Current toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className="relative h-5 w-9 border-2 transition-colors"
                    style={{ borderColor: form.is_current ? "#c8e64a" : "var(--color-border)", backgroundColor: form.is_current ? "rgba(200,230,74,0.1)" : "transparent" }}
                  >
                    <div
                      className="absolute top-0.5 h-3 w-3 transition-all"
                      style={{ left: form.is_current ? "16px" : "2px", backgroundColor: form.is_current ? "#c8e64a" : "var(--color-border)" }}
                    />
                  </div>
                  <input type="checkbox" checked={form.is_current} onChange={(e) => setForm((f) => ({ ...f, is_current: e.target.checked }))} className="sr-only" />
                  <span className="text-sm text-cream normal-case">I currently work here</span>
                </label>

                {/* End date (only if not current) */}
                {!form.is_current && (
                  <div>
                    <label className="block text-xs text-muted font-pixel uppercase mb-1.5">End date</label>
                    <div className="grid grid-cols-2 gap-3">
                      <select value={form.end_month} onChange={(e) => setForm((f) => ({ ...f, end_month: e.target.value }))} className={selectClass}>
                        {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <select value={form.end_year} onChange={(e) => setForm((f) => ({ ...f, end_year: e.target.value }))} className={selectClass}>
                        <option value="">Year</option>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Impact */}
                <div>
                  <label htmlFor="exp-impact" className="block text-xs text-muted font-pixel uppercase mb-1.5">Key impact</label>
                  <textarea
                    id="exp-impact"
                    value={form.impact_line}
                    onChange={(e) => setForm((f) => ({ ...f, impact_line: e.target.value }))}
                    placeholder="Led the migration to microservices, improving throughput by 3x"
                    maxLength={200}
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                  <p className="mt-1 text-right text-[10px] text-muted/30">{form.impact_line.length}/200</p>
                </div>

                {error && <p className="text-xs text-red-400 normal-case">{error}</p>}

                <div className="space-y-3 pt-2">
                  <button
                    onClick={save}
                    disabled={saving || !form.company.trim() || !form.role.trim() || !form.start_year}
                    className="cursor-pointer w-full py-3 text-sm text-bg font-pixel uppercase disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                    style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #8fa832" }}
                  >
                    {saving ? "Saving..." : editingId ? "Save changes" : "Add experience"}
                  </button>
                  {editingId && (
                    <button
                      onClick={remove}
                      disabled={saving}
                      className="cursor-pointer w-full py-3 text-sm text-red-400 font-pixel uppercase border-[3px] border-red-400/20 transition-colors hover:border-red-400/50 hover:bg-red-400/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
