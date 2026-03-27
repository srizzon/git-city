"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PortfolioProject } from "@/lib/portfolio/types";

interface Props {
  projects: PortfolioProject[];
  isOwner: boolean;
}

const MAX_TAGS = 5;
const MAX_TITLE = 60;
const MAX_DESC = 280;
const MAX_ROLE = 60;

interface FormData {
  title: string;
  description: string;
  role: string;
  tags: string[];
  tagInput: string;
  live_url: string;
  source_url: string;
}

const EMPTY_FORM: FormData = {
  title: "",
  description: "",
  role: "",
  tags: [],
  tagInput: "",
  live_url: "",
  source_url: "",
};

export default function PortfolioProjects({ projects: initialProjects, isOwner }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setPanelOpen(false);
    setEditingId(null);
    setError("");
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  // Escape key handler
  useEffect(() => {
    if (!panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, close]);

  // Focus trap + initial focus
  useEffect(() => {
    if (!panelOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    panel.addEventListener("keydown", trapFocus);
    return () => panel.removeEventListener("keydown", trapFocus);
  }, [panelOpen]);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setPanelOpen(true);
  }

  function openEdit(project: PortfolioProject) {
    setEditingId(project.id);
    setForm({
      title: project.title,
      description: project.description ?? "",
      role: project.role ?? "",
      tags: project.tech_stack,
      tagInput: "",
      live_url: project.live_url ?? "",
      source_url: project.source_url ?? "",
    });
    setError("");
    setPanelOpen(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const liveUrl = form.live_url.trim();
      const sourceUrl = form.source_url.trim();
      if (liveUrl && !liveUrl.startsWith("http")) { setError("Live URL must start with http"); return; }
      if (sourceUrl && !sourceUrl.startsWith("http")) { setError("Source URL must start with http"); return; }

      const body = {
        title: form.title.trim().slice(0, MAX_TITLE),
        description: form.description.trim().slice(0, MAX_DESC) || null,
        role: form.role.trim().slice(0, MAX_ROLE) || null,
        tech_stack: form.tags.slice(0, MAX_TAGS),
        live_url: liveUrl || null,
        source_url: sourceUrl || null,
      };

      if (editingId) {
        const res = await fetch(`/api/portfolio/projects/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
        if (data.project) {
          setProjects((prev) => prev.map((p) => (p.id === editingId ? data.project : p)));
        }
      } else {
        const res = await fetch("/api/portfolio/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
        if (data.project) {
          setProjects((prev) => [...prev, data.project]);
        }
      }
      close();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await fetch(`/api/portfolio/projects/${editingId}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== editingId));
      close();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs text-muted/50 tracking-[0.15em]">Projects</h2>
          {isOwner && projects.length > 0 && (
            <button
              ref={triggerRef}
              onClick={openNew}
              className="cursor-pointer border-[3px] border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-light hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
            >
              + Add
            </button>
          )}
        </div>

        {projects.length > 0 ? (
          <div className={`grid grid-cols-1 gap-5 ${projects.length >= 2 ? "sm:grid-cols-2" : ""}`}>
            {projects.map((project, i) => {
              // 1 project: full width. 2: both half. 3+: first full, rest half.
              const isFeatured = projects.length !== 2 && i === 0;
              return (
                <div
                  key={project.id}
                  role={isOwner ? "button" : undefined}
                  tabIndex={isOwner ? 0 : undefined}
                  onKeyDown={isOwner ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(project); } } : undefined}
                  className={`group flex flex-col border-[3px] border-border bg-bg transition-all hover:border-border-light ${isFeatured ? "sm:col-span-2" : ""} ${isOwner ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50" : ""}`}
                  onClick={isOwner ? () => openEdit(project) : undefined}
                >
                  {project.image_urls.length > 0 && (
                    <img
                      src={project.image_urls[0]}
                      alt={`${project.title} screenshot`}
                      className={`w-full object-cover ${isFeatured ? "aspect-[21/9]" : "aspect-video"}`}
                    />
                  )}

                  <div className="flex flex-col flex-1 p-5 sm:p-6">
                    {/* Header: title + badges */}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base text-cream">{project.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        {project.is_verified && (
                          <span className="text-xs text-[#4ade80]" aria-label="Verified project">&#10003; Verified</span>
                        )}
                        {isOwner && (
                          <span className="text-xs text-muted/30 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">Edit</span>
                        )}
                      </div>
                    </div>

                    {/* Role */}
                    {project.role && (
                      <p className="mt-1 text-xs text-muted/60 normal-case">{project.role}</p>
                    )}

                    {/* Description — always clamp to 3 lines for consistency */}
                    {project.description && (
                      <p className="mt-3 text-sm text-muted normal-case leading-relaxed line-clamp-3">
                        {project.description}
                      </p>
                    )}

                    {/* Spacer pushes tech + buttons to bottom */}
                    <div className="flex-1" />

                    {/* Tech stack — max 4 visible + overflow count */}
                    {project.tech_stack.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 h-[30px] overflow-hidden">
                        {project.tech_stack.slice(0, 4).map((t) => (
                          <span key={t} className="border-[2px] border-[#c8e64a]/20 px-2.5 py-1 text-xs text-[#c8e64a]/70">
                            {t}
                          </span>
                        ))}
                        {project.tech_stack.length > 4 && (
                          <span className="px-1.5 py-1 text-xs text-muted/50">
                            +{project.tech_stack.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons — always at bottom */}
                    {(project.live_url || project.source_url) && (
                      <div className="mt-4 flex gap-3 pt-2 border-t border-border/20">
                        {project.live_url && (
                          <a
                            href={project.live_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer border-[3px] border-[#c8e64a]/30 px-4 py-2 text-xs text-[#c8e64a] transition-colors hover:border-[#c8e64a] hover:bg-[#c8e64a]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Live Demo &#8599;
                          </a>
                        )}
                        {project.source_url && (
                          <a
                            href={project.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer border-[3px] border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Source &#8599;
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-lg text-muted/40 normal-case">Showcase your best work</p>
            <p className="mt-2 text-sm text-muted/30 normal-case">
              Add projects so visitors can see what you&apos;ve built.
            </p>
            {isOwner && (
              <button
                ref={triggerRef}
                onClick={openNew}
                className="cursor-pointer mt-5 border-[3px] border-[#c8e64a]/30 px-6 py-3 text-sm text-[#c8e64a] transition-colors hover:border-[#c8e64a] hover:bg-[#c8e64a]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
              >
                + Add your first project
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Slide-over Panel ─── */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? "Edit project" : "New project"}
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
                  {editingId ? "Edit project" : "New project"}
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
                {/* Title */}
                <div>
                  <label htmlFor="proj-title" className="block text-xs text-muted font-pixel uppercase mb-1.5">
                    Title *
                  </label>
                  <input
                    id="proj-title"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Git City"
                    maxLength={MAX_TITLE}
                    className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                  />
                  <p className="mt-1 text-right text-[10px] text-muted/30">{form.title.length}/{MAX_TITLE}</p>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="proj-desc" className="block text-xs text-muted font-pixel uppercase mb-1.5">
                    Description
                  </label>
                  <textarea
                    id="proj-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What does it do? What problem does it solve?"
                    maxLength={MAX_DESC}
                    rows={3}
                    className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 resize-none"
                  />
                  <p className="mt-1 text-right text-[10px] text-muted/30">{form.description.length}/{MAX_DESC}</p>
                </div>

                {/* Role */}
                <div>
                  <label htmlFor="proj-role" className="block text-xs text-muted font-pixel uppercase mb-1.5">
                    Your role
                  </label>
                  <input
                    id="proj-role"
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="Creator & solo developer"
                    maxLength={MAX_ROLE}
                    className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                  />
                </div>

                {/* Tech stack — tag input */}
                <div>
                  <label className="block text-xs text-muted font-pixel uppercase mb-1.5">
                    Tech stack <span className="text-muted/30 normal-case">({form.tags.length}/{MAX_TAGS})</span>
                  </label>
                  {form.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {form.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}
                          className="cursor-pointer border-[2px] border-[#c8e64a]/30 px-2.5 py-1 text-xs text-[#c8e64a] transition-colors hover:border-red-400/50 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 group"
                          aria-label={`Remove ${tag}`}
                        >
                          {tag} <span className="text-muted/30 group-hover:text-red-400">&times;</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.tags.length < MAX_TAGS && (
                    <input
                      type="text"
                      value={form.tagInput}
                      onChange={(e) => setForm((f) => ({ ...f, tagInput: e.target.value }))}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === ",") && form.tagInput.trim()) {
                          e.preventDefault();
                          const tag = form.tagInput.trim().toLowerCase();
                          if (!form.tags.includes(tag)) {
                            setForm((f) => ({ ...f, tags: [...f.tags, tag], tagInput: "" }));
                          } else {
                            setForm((f) => ({ ...f, tagInput: "" }));
                          }
                        }
                        if (e.key === "Backspace" && !form.tagInput && form.tags.length > 0) {
                          setForm((f) => ({ ...f, tags: f.tags.slice(0, -1) }));
                        }
                      }}
                      placeholder={form.tags.length === 0 ? "Type and press Enter..." : "Add more..."}
                      className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                    />
                  )}
                  {form.tags.length >= MAX_TAGS && (
                    <p className="text-[10px] text-muted/40 normal-case mt-1">Maximum {MAX_TAGS} tags reached</p>
                  )}
                </div>

                {/* Live URL */}
                <div>
                  <label htmlFor="proj-live" className="block text-xs text-muted font-pixel uppercase mb-1.5">
                    Live demo URL
                  </label>
                  <input
                    id="proj-live"
                    type="url"
                    value={form.live_url}
                    onChange={(e) => setForm((f) => ({ ...f, live_url: e.target.value }))}
                    placeholder="https://myproject.com"
                    className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                  />
                </div>

                <div>
                  <label htmlFor="proj-source" className="block text-xs text-muted font-pixel uppercase mb-1.5">
                    Source code URL
                  </label>
                  <input
                    id="proj-source"
                    type="url"
                    value={form.source_url}
                    onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                    placeholder="https://github.com/user/repo"
                    className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                  />
                </div>
              </div>

              {error && <p className="mt-4 text-xs text-red-400 normal-case">{error}</p>}

              <div className="mt-8 space-y-3">
                <button
                  onClick={save}
                  disabled={saving || !form.title.trim()}
                  className="cursor-pointer w-full py-3 text-sm text-bg font-pixel uppercase transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                  style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #8fa832" }}
                >
                  {saving ? "Saving..." : editingId ? "Save changes" : "Add project"}
                </button>

                {editingId && (
                  <button
                    onClick={remove}
                    disabled={deleting}
                    className="cursor-pointer w-full py-3 text-sm text-red-400 font-pixel uppercase border-[3px] border-red-400/20 transition-colors hover:border-red-400/50 hover:bg-red-400/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                  >
                    {deleting ? "Deleting..." : "Delete project"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
