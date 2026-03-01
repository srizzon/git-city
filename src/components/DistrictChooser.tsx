"use client";

import { useState, useEffect } from "react";
import {
  DISTRICT_NAMES,
  DISTRICT_COLORS,
  DISTRICT_DESCRIPTIONS,
} from "@/lib/github";

interface DistrictChooserProps {
  currentDistrict: string | null;
  inferredDistrict: string | null;
  onClose: () => void;
  onChosen: (districtId: string) => void;
}

const CHOOSABLE_DISTRICTS = [
  "frontend", "backend", "fullstack", "mobile", "data_ai",
  "devops", "security", "gamedev", "vibe_coder", "creator",
];

export default function DistrictChooser({
  currentDistrict,
  inferredDistrict,
  onClose,
  onChosen,
}: DistrictChooserProps) {
  const [selected, setSelected] = useState<string | null>(currentDistrict);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/district/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district_id: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onChosen(data.district);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto border-[3px] border-border bg-bg-raised p-5 sm:p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-xs text-muted hover:text-cream"
        >
          &#10005;
        </button>

        <h2 className="text-lg text-cream">Choose your district</h2>

        {inferredDistrict && (
          <p className="mt-1 text-[10px] text-muted normal-case">
            You were auto-assigned to{" "}
            <span style={{ color: DISTRICT_COLORS[inferredDistrict] }}>
              {DISTRICT_NAMES[inferredDistrict]}
            </span>{" "}
            based on your primary language. Choose where you really belong:
          </p>
        )}

        {/* District grid */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHOOSABLE_DISTRICTS.map((id) => {
            const isSelected = selected === id;
            const color = DISTRICT_COLORS[id] ?? "#888";
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                className="btn-press flex items-start gap-2 border-[3px] p-2.5 text-left transition-colors"
                style={{
                  borderColor: isSelected ? color : "var(--color-border)",
                  borderLeftColor: color,
                  borderLeftWidth: "5px",
                  backgroundColor: isSelected ? `${color}10` : undefined,
                }}
              >
                <div className="min-w-0">
                  <span
                    className="text-[11px]"
                    style={{ color: isSelected ? color : "var(--color-cream)" }}
                  >
                    {DISTRICT_NAMES[id]}
                  </span>
                  <p className="mt-0.5 text-[8px] text-muted normal-case">
                    {DISTRICT_DESCRIPTIONS[id]}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 text-[10px] text-red-400 normal-case">{error}</p>
        )}

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={!selected || submitting}
          className="btn-press mt-4 w-full border-[3px] border-border px-4 py-2.5 text-sm text-bg transition-colors disabled:opacity-40"
          style={{
            backgroundColor: selected
              ? DISTRICT_COLORS[selected]
              : "var(--color-muted)",
          }}
        >
          {submitting ? "Confirming..." : "Confirm District"}
        </button>
      </div>
    </div>
  );
}
