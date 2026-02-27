"use client";

import type { AdForm } from "../_lib/types";
import { VEHICLE_LABELS, VEHICLES } from "../_lib/constants";

interface AdFormFieldsProps {
  form: AdForm;
  onChange: (form: AdForm) => void;
}

export function AdFormFields({ form, onChange }: AdFormFieldsProps) {
  const set = <K extends keyof AdForm>(key: K, value: AdForm[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Brand */}
      <div>
        <label className="mb-1 block text-[11px] text-muted">Brand *</label>
        <input
          required
          placeholder="Acme Inc"
          value={form.brand}
          onChange={(e) => set("brand", e.target.value)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>

      {/* Vehicle */}
      <div className="sm:col-span-2">
        <label className="mb-1 block text-[11px] text-muted">Vehicle</label>
        <div className="flex flex-wrap">
          {VEHICLES.map((val, i) => (
            <button
              key={val}
              type="button"
              onClick={() => set("vehicle", val)}
              className={`cursor-pointer border px-3 py-2.5 text-xs transition-colors ${
                form.vehicle === val
                  ? "border-lime bg-lime/10 text-lime"
                  : "border-border text-muted hover:text-cream"
              } ${i > 0 ? "border-l-0" : ""}`}
            >
              {VEHICLE_LABELS[val]}
            </button>
          ))}
        </div>
      </div>

      {/* Banner text */}
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="mb-1 block text-[11px] text-muted">
          Banner text * (max 80)
        </label>
        <input
          required
          placeholder="YOUR BRAND MESSAGE HERE"
          maxLength={80}
          value={form.text}
          onChange={(e) => set("text", e.target.value)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>

      {/* Description */}
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="mb-1 block text-[11px] text-muted">
          Description
        </label>
        <textarea
          maxLength={200}
          rows={2}
          placeholder="Internal note"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>

      {/* Link */}
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="mb-1 block text-[11px] text-muted">Link</label>
        <input
          placeholder="https://example.com"
          value={form.link}
          onChange={(e) => set("link", e.target.value)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>

      {/* Colors */}
      <div className="flex items-end gap-4">
        <div>
          <label className="mb-1 block text-[11px] text-muted">
            Text color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              className="h-9 w-9 cursor-pointer border border-border bg-bg"
            />
            <span className="text-xs text-dim">{form.color}</span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted">BG color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.bg_color}
              onChange={(e) => set("bg_color", e.target.value)}
              className="h-9 w-9 cursor-pointer border border-border bg-bg"
            />
            <span className="text-xs text-dim">{form.bg_color}</span>
          </div>
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="mb-1 block text-[11px] text-muted">Priority</label>
        <input
          type="number"
          value={form.priority}
          onChange={(e) => set("priority", parseInt(e.target.value) || 50)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>

      {/* Dates */}
      <div>
        <label className="mb-1 block text-[11px] text-muted">Starts at</label>
        <input
          type="datetime-local"
          value={form.starts_at}
          onChange={(e) => set("starts_at", e.target.value)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted">Ends at</label>
        <input
          type="datetime-local"
          value={form.ends_at}
          onChange={(e) => set("ends_at", e.target.value)}
          className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
        />
      </div>

      {/* Banner preview */}
      {form.text && (
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="mb-1 text-[11px] text-muted">Preview</p>
          <div
            className="overflow-hidden px-4 py-2 text-center text-xs tracking-widest"
            style={{
              backgroundColor: form.bg_color,
              color: form.color,
              fontFamily: "monospace",
              letterSpacing: "0.12em",
            }}
          >
            {form.text}
          </div>
        </div>
      )}
    </div>
  );
}
