"use client";

import { useState } from "react";
import type { JobCompanyProfileAdmin } from "@/lib/jobs/types";

interface CompanyFormProps {
  mode: "create" | "edit";
  company?: JobCompanyProfileAdmin;
  onSave: (company: JobCompanyProfileAdmin) => void;
  onClose: () => void;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CompanyForm({ mode, company, onSave, onClose }: CompanyFormProps) {
  const [name, setName] = useState(company?.name ?? "");
  const [slug, setSlug] = useState(company?.slug ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [description, setDescription] = useState(company?.description ?? "");
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? "");
  const [githubOrg, setGithubOrg] = useState(company?.github_org ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSlug, setAutoSlug] = useState(mode === "create");

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug && mode === "create") {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setAutoSlug(false);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    const body = { name, slug, website, description, logo_url: logoUrl, github_org: githubOrg };

    try {
      const url = mode === "create" ? "/api/admin/companies" : `/api/admin/companies/${company!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      onSave(data.company);
    } catch {
      setError("Failed to save");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-bg border-[3px] border-border no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-5 py-3">
          <h2 className="text-sm text-cream">{mode === "create" ? "CREATE COMPANY" : "EDIT COMPANY"}</h2>
          <button onClick={onClose} className="text-xs text-dim hover:text-cream cursor-pointer">CLOSE</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">{error}</div>
          )}

          <Field label="Name *">
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
              placeholder="Amplify IT"
            />
          </Field>

          <Field label="Slug *">
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream font-mono outline-none focus:border-lime/50"
              placeholder="acme-corp"
            />
          </Field>

          <Field label="Website *">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
              placeholder="https://example.com"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50 resize-none"
              placeholder="Brief company description..."
            />
          </Field>

          <Field label="Logo URL">
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
              placeholder="https://..."
            />
          </Field>

          <Field label="GitHub Org">
            <input
              type="text"
              value={githubOrg}
              onChange={(e) => setGithubOrg(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
              placeholder="acme-corp"
            />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream"
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !slug.trim() || !website.trim()}
              className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "SAVING..." : mode === "create" ? "CREATE" : "SAVE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-dim mb-1.5">{label}</label>
      {children}
    </div>
  );
}
