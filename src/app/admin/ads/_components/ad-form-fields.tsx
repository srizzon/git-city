"use client";

import type { AdForm } from "../_lib/types";
import { VEHICLE_LABELS, VEHICLES } from "../_lib/constants";

interface AdFormFieldsProps {
  form: AdForm;
  onChange: (form: AdForm) => void;
}

const inputCls = "w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime";
const labelCls = "mb-1 block text-[11px] text-muted";

function toLocalDatetime(iso: string): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return localIso(d);
}

function localIso(d: Date): string {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D}T${h}:${m}`;
}

function DatePicker({ label, value, onChange, quickDays }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  quickDays?: number[];
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="datetime-local"
        value={toLocalDatetime(value)}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {quickDays && (
        <div className="mt-1.5 flex gap-1.5">
          {quickDays.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                const date = new Date();
                date.setDate(date.getDate() + d);
                date.setHours(23, 59, 0, 0);
                onChange(localIso(date));
              }}
              className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-lime hover:text-lime"
            >
              +{d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange(localIso(new Date()));
            }}
            className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-lime hover:text-lime"
          >
            now
          </button>
        </div>
      )}
    </div>
  );
}

export function AdFormFields({ form, onChange }: AdFormFieldsProps) {
  const set = <K extends keyof AdForm>(key: K, value: AdForm[K]) =>
    onChange({ ...form, [key]: value });

  const isLandmark = form.vehicle === "landmark";

  return (
    <div className="space-y-5">
      {/* Vehicle selector */}
      <div>
        <label className={labelCls}>Type</label>
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

      {isLandmark ? <LandmarkFields form={form} set={set} /> : <SkyAdFields form={form} set={set} />}
    </div>
  );
}

// ─── Landmark-specific fields ───────────────────────────
function LandmarkFields({ form, set }: { form: AdForm; set: <K extends keyof AdForm>(key: K, value: AdForm[K]) => void }) {
  return (
    <>
      {/* Row: Brand + Slug */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Brand name *</label>
          <input required placeholder="Dinzo" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Slug * <span className="text-dim">(must match registry.tsx)</span></label>
          <input required placeholder="dinzo" value={form.text} onChange={(e) => set("text", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Sponsor email */}
      <div>
        <label className={labelCls}>Sponsor email <span className="text-dim">(creates dashboard access automatically)</span></label>
        <input type="email" placeholder="sponsor@company.com" value={form.purchaser_email} onChange={(e) => set("purchaser_email", e.target.value)} className={inputCls} />
      </div>

      {/* Link */}
      <div>
        <label className={labelCls}>Website URL</label>
        <input placeholder="https://example.com" value={form.link} onChange={(e) => set("link", e.target.value)} className={inputCls} />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Internal note</label>
        <input placeholder="R$500/month, paid via Pix" value={form.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
      </div>

      {/* Dates with quick buttons */}
      <div className="grid grid-cols-2 gap-4">
        <DatePicker label="Starts at" value={form.starts_at} onChange={(v) => set("starts_at", v)} quickDays={[]} />
        <DatePicker label="Ends at" value={form.ends_at} onChange={(v) => set("ends_at", v)} quickDays={[30, 60, 90]} />
      </div>
    </>
  );
}

// ─── Sky Ad fields (plane, blimp, billboard, etc.) ──────
function SkyAdFields({ form, set }: { form: AdForm; set: <K extends keyof AdForm>(key: K, value: AdForm[K]) => void }) {
  return (
    <>
      {/* Brand */}
      <div>
        <label className={labelCls}>Brand *</label>
        <input required placeholder="Acme Inc" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} />
      </div>

      {/* Banner text */}
      <div>
        <label className={labelCls}>Banner text * <span className="text-dim">(max 80)</span></label>
        <input required placeholder="YOUR BRAND MESSAGE HERE" maxLength={80} value={form.text} onChange={(e) => set("text", e.target.value)} className={inputCls} />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea maxLength={200} rows={2} placeholder="Internal note" value={form.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
      </div>

      {/* Link */}
      <div>
        <label className={labelCls}>Link</label>
        <input placeholder="https://example.com" value={form.link} onChange={(e) => set("link", e.target.value)} className={inputCls} />
      </div>

      {/* Colors + Priority */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className={labelCls}>Text color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-9 w-9 cursor-pointer border border-border bg-bg" />
            <span className="text-xs text-dim">{form.color}</span>
          </div>
        </div>
        <div>
          <label className={labelCls}>BG color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.bg_color} onChange={(e) => set("bg_color", e.target.value)} className="h-9 w-9 cursor-pointer border border-border bg-bg" />
            <span className="text-xs text-dim">{form.bg_color}</span>
          </div>
        </div>
        <div>
          <label className={labelCls}>Priority</label>
          <input type="number" value={form.priority} onChange={(e) => set("priority", parseInt(e.target.value) || 50)} className="w-20 border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime" />
        </div>
      </div>

      {/* Purchaser email */}
      <div>
        <label className={labelCls}>Purchaser email</label>
        <input type="email" placeholder="buyer@company.com" value={form.purchaser_email} onChange={(e) => set("purchaser_email", e.target.value)} className={inputCls} />
      </div>

      {/* Dates with quick buttons */}
      <div className="grid grid-cols-2 gap-4">
        <DatePicker label="Starts at" value={form.starts_at} onChange={(v) => set("starts_at", v)} quickDays={[]} />
        <DatePicker label="Ends at" value={form.ends_at} onChange={(v) => set("ends_at", v)} quickDays={[7, 30, 90]} />
      </div>

      {/* Banner preview */}
      {form.text && (
        <div>
          <p className="mb-1 text-[11px] text-muted">Preview</p>
          <div
            className="overflow-hidden px-4 py-2 text-center text-xs tracking-widest"
            style={{ backgroundColor: form.bg_color, color: form.color, fontFamily: "monospace", letterSpacing: "0.12em" }}
          >
            {form.text}
          </div>
        </div>
      )}
    </>
  );
}
