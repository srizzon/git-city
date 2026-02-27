"use client";

import { useState, useEffect, useCallback } from "react";
import type { AdStats, AdForm } from "../_lib/types";
import { EMPTY_FORM } from "../_lib/constants";
import { AdFormFields } from "./ad-form-fields";

interface AdModalProps {
  open: boolean;
  mode: "create" | "edit";
  ad?: AdStats;
  saving: boolean;
  onClose: () => void;
  onCreate: (form: AdForm) => Promise<boolean>;
  onEdit: (id: string, form: AdForm) => Promise<boolean>;
}

function adToForm(ad: AdStats): AdForm {
  return {
    brand: ad.brand,
    text: ad.text,
    description: ad.description ?? "",
    color: ad.color,
    bg_color: ad.bg_color,
    link: ad.link ?? "",
    vehicle: ad.vehicle as AdForm["vehicle"],
    priority: ad.priority,
    starts_at: ad.starts_at ? ad.starts_at.slice(0, 16) : "",
    ends_at: ad.ends_at ? ad.ends_at.slice(0, 16) : "",
  };
}

export function AdModal({
  open,
  mode,
  ad,
  saving,
  onClose,
  onCreate,
  onEdit,
}: AdModalProps) {
  const [form, setForm] = useState<AdForm>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(mode === "edit" && ad ? adToForm(ad) : EMPTY_FORM);
    }
  }, [open, mode, ad]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      let ok: boolean;
      if (mode === "create") {
        ok = await onCreate(form);
      } else {
        ok = await onEdit(ad!.id, form);
      }
      if (ok) onClose();
    },
    [mode, form, ad, onCreate, onEdit, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 pt-[5vh]">
      <div className="mb-[5vh] w-full max-w-2xl border-2 border-border bg-bg-raised p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-cream">
            {mode === "create" ? "CREATE NEW AD" : `EDIT: ${ad?.brand}`}
          </p>
          <button
            onClick={onClose}
            className="cursor-pointer text-muted transition-colors hover:text-cream"
          >
            x
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <AdFormFields form={form} onChange={setForm} />

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer border-2 border-lime bg-lime/10 px-6 py-2.5 text-xs text-lime transition-colors hover:bg-lime/20 disabled:opacity-50"
            >
              {saving
                ? mode === "create"
                  ? "CREATING..."
                  : "SAVING..."
                : mode === "create"
                  ? "CREATE AD"
                  : "SAVE"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer border border-border px-6 py-2.5 text-xs text-muted transition-colors hover:text-cream"
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
