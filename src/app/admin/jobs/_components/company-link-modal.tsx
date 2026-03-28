"use client";

import { useState } from "react";
import type { JobCompanyProfileAdmin } from "@/lib/jobs/types";

interface CompanyLinkModalProps {
  company: JobCompanyProfileAdmin;
  onLinked: (email: string) => void;
  onClose: () => void;
}

export function CompanyLinkModal({ company, onLinked, onClose }: CompanyLinkModalProps) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to link");
        setSaving(false);
        return;
      }
      onLinked(data.advertiser_email);
    } catch {
      setError("Failed to link");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-sm bg-bg border-[3px] border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm text-cream">LINK ADVERTISER</h2>
          <p className="mt-1 text-xs text-muted">Link &quot;{company.name}&quot; to an advertiser email</p>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">{error}</div>
          )}

          <div>
            <label className="block text-[10px] text-dim mb-1.5">Advertiser Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-raised border border-border px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
              placeholder="contact@company.com"
              autoFocus
            />
            <p className="mt-1 text-[10px] text-dim">
              Creates account if it doesn&apos;t exist. Advertiser can then manage via magic link login.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream"
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !email.includes("@")}
              className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "LINKING..." : "LINK"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
