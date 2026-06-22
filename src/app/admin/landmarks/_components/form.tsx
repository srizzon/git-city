"use client";

import Link from "next/link";
import { useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Landmark, OrnamentName, AccentSource, TemplateConfig } from "@/lib/landmarks/types";
import { LivePreview } from "./live-preview";
import { ToastContainer, type Toast } from "./toast";
import { PixelSelect } from "@/components/ui/PixelSelect";

interface FormProps {
  mode: "create" | "edit";
  initial?: Landmark;
  ornamentNames: readonly OrnamentName[];
  facadeBitmapNames: readonly string[];
  customComponentNames: readonly string[];
}

type FacadeMode = "pixel_text" | "facade_bitmap";

export function LandmarkForm({
  mode,
  initial,
  ornamentNames,
  facadeBitmapNames,
  customComponentNames,
}: FormProps) {
  const router = useRouter();

  // ── State ──
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "https://");
  const [features, setFeatures] = useState<string[]>(initial?.features ?? ["", "", ""]);
  const [accent, setAccent] = useState(initial?.accent ?? "#6090e0");
  const [hitboxRadius, setHitboxRadius] = useState(initial?.hitboxRadius ?? 80);
  const [hitboxHeight, setHitboxHeight] = useState(initial?.hitboxHeight ?? 500);
  const [buildingKind, setBuildingKind] = useState<"tower" | "custom">(
    initial?.buildingKind ?? "tower",
  );
  const [customComponent, setCustomComponent] = useState(initial?.customComponent ?? "");
  const [facadeMode, setFacadeMode] = useState<FacadeMode>(
    initial?.templateConfig?.facade_bitmap ? "facade_bitmap" : "pixel_text",
  );
  const [pixelText, setPixelText] = useState(initial?.templateConfig?.pixel_text ?? "");
  const [facadeBitmap, setFacadeBitmap] = useState(initial?.templateConfig?.facade_bitmap ?? "");
  const [roofOrnament, setRoofOrnament] = useState<OrnamentName>(
    initial?.templateConfig?.roof_ornament ?? "none",
  );
  const [accentSource, setAccentSource] = useState<AccentSource>(
    initial?.templateConfig?.accent_source ?? "theme",
  );
  const [priority, setPriority] = useState(initial?.priority ?? 100);
  const [ownersCsv, setOwnersCsv] = useState((initial?.ownerGithubLogins ?? []).join(", "));
  const [active, setActive] = useState(initial?.active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingWelcome, setSendingWelcome] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  const customDisabled = customComponentNames.length === 0;

  // ── Preview state (computed from form) ──
  const previewTemplate: TemplateConfig | null = useMemo(() => {
    if (buildingKind !== "tower") return null;
    return {
      pixel_text: facadeMode === "pixel_text" ? pixelText : undefined,
      facade_bitmap: facadeMode === "facade_bitmap" ? facadeBitmap : undefined,
      roof_ornament: roofOrnament,
      accent_source: accentSource,
    };
  }, [buildingKind, facadeMode, pixelText, facadeBitmap, roofOrnament, accentSource]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const ownerGithubLogins = ownersCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const templateConfig =
      buildingKind === "tower"
        ? {
            pixel_text: facadeMode === "pixel_text" ? pixelText : undefined,
            facade_bitmap: facadeMode === "facade_bitmap" ? facadeBitmap : undefined,
            roof_ornament: roofOrnament,
            accent_source: accentSource,
          }
        : null;

    const body = {
      slug, name, tagline, description, url,
      features: features.filter(Boolean),
      accent, hitboxRadius, hitboxHeight,
      buildingKind,
      customComponent: buildingKind === "custom" ? customComponent || null : null,
      templateConfig,
      priority, ownerGithubLogins, active,
    };

    try {
      const endpoint =
        mode === "create"
          ? "/api/admin/landmarks"
          : `/api/admin/landmarks/${initial?.id}`;
      const res = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        setSaving(false);
        return;
      }
      addToast("success", mode === "create" ? "Landmark created" : "Saved");
      router.push("/admin/landmarks");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function handleSendWelcome() {
    if (!initial) return;
    if (!confirm("Send welcome email to all listed owners?")) return;
    setSendingWelcome(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/landmarks/${initial.id}/send-welcome-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      addToast("success", `Sent to ${(json.sentTo ?? []).length} recipient(s)`);
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : String(e));
    }
    setSendingWelcome(false);
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`Hide "${initial.slug}" from rotation?`)) return;
    try {
      const res = await fetch(`/api/admin/landmarks/${initial.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Delete failed");
      }
      addToast("success", "Hidden");
      router.push("/admin/landmarks");
      router.refresh();
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : String(e));
    }
  }

  const canSendWelcome = mode === "edit" && active && ownersCsv.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/admin/landmarks"
              className="text-[10px] text-dim hover:text-cream"
            >
              ← LANDMARKS
            </Link>
            <h1 className="mt-2 text-2xl text-cream">
              {mode === "create" ? "NEW LANDMARK" : (initial?.name ?? "").toUpperCase()}
            </h1>
            {mode === "edit" && (
              <p className="mt-1 font-mono text-[10px] text-dim">{initial?.slug}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/landmarks"
              className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              CANCEL
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10 disabled:opacity-50"
            >
              {saving ? "SAVING…" : mode === "create" ? "CREATE" : "SAVE"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Two columns: form | preview */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Form column */}
          <div className="space-y-5">
            <Section title="IDENTITY">
              <div className="space-y-3">
                <Field label="Slug *" hint="lowercase, a-z 0-9 -, 2-40 chars">
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    disabled={mode === "edit"}
                    className="w-full border border-border bg-bg-raised px-3 py-2 font-mono text-sm text-cream outline-none focus:border-lime/50 disabled:opacity-50"
                  />
                </Field>
                <Field label="Name *">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                </Field>
                <Field label="Tagline *" hint="1-60 chars">
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                </Field>
                <Field label={`Description * (${description.length}/240)`}>
                  <textarea
                    required
                    rows={3}
                    maxLength={240}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                </Field>
                <Field label="URL *">
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                </Field>
              </div>
            </Section>

            <Section title="FEATURES" hint="Up to 3 items, shown on the card">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={40}
                    value={features[i] ?? ""}
                    onChange={(e) => {
                      const next = [...features];
                      next[i] = e.target.value;
                      setFeatures(next);
                    }}
                    placeholder={`Feature ${i + 1}`}
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                ))}
              </div>
            </Section>

            <Section title="RENDERING">
              <div className="space-y-3">
                <Field label="Accent color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      className="h-9 w-12 cursor-pointer border border-border bg-bg-raised"
                    />
                    <input
                      type="text"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      pattern="^#[0-9a-fA-F]{6}$"
                      className="w-32 border border-border bg-bg-raised px-3 py-2 font-mono text-sm text-cream outline-none focus:border-lime/50"
                    />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hitbox radius">
                    <input
                      type="number"
                      value={hitboxRadius}
                      min={40}
                      max={200}
                      onChange={(e) => setHitboxRadius(Number(e.target.value))}
                      className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                    />
                  </Field>
                  <Field label="Hitbox height">
                    <input
                      type="number"
                      value={hitboxHeight}
                      min={100}
                      max={800}
                      onChange={(e) => setHitboxHeight(Number(e.target.value))}
                      className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                    />
                  </Field>
                </div>
              </div>
            </Section>

            <Section title="BUILDING KIND">
              <div className="space-y-2">
                <Radio
                  checked={buildingKind === "tower"}
                  onChange={() => setBuildingKind("tower")}
                  label="tower"
                  hint="default, template-driven"
                />
                <Radio
                  checked={buildingKind === "custom"}
                  onChange={() => setBuildingKind("custom")}
                  label="custom"
                  hint={
                    customDisabled
                      ? "reserved for bespoke commissions"
                      : "legacy or bespoke component"
                  }
                  disabled={customDisabled}
                />
              </div>
            </Section>

            {buildingKind === "custom" && (
              <Section title="CUSTOM COMPONENT">
                <Field label="Component name">
                  <PixelSelect
                    value={String(customComponent)}
                    onChange={(v) => setCustomComponent(v)}
                    options={customComponentNames.map((n) => ({ value: n, label: n }))}
                    placeholder="— choose —"
                    className="w-full"
                    ariaLabel="Component name"
                  />
                </Field>
              </Section>
            )}

            {buildingKind === "tower" && (
              <Section title="TEMPLATE">
                <div className="space-y-4">
                  <Field label="Facade">
                    <div className="space-y-2">
                      <Radio
                        checked={facadeMode === "pixel_text"}
                        onChange={() => setFacadeMode("pixel_text")}
                        label="pixel text"
                      />
                      <Radio
                        checked={facadeMode === "facade_bitmap"}
                        onChange={() => setFacadeMode("facade_bitmap")}
                        label="named bitmap"
                      />
                    </div>
                  </Field>

                  {facadeMode === "pixel_text" && (
                    <Field
                      label="Pixel text"
                      hint="1-8 chars per line, max 2 lines. A-Z 0-9 space - . ? !"
                    >
                      <textarea
                        rows={2}
                        value={pixelText}
                        onChange={(e) => setPixelText(e.target.value.toUpperCase())}
                        placeholder="HIRED"
                        className="w-full border border-border bg-bg-raised px-3 py-2 font-mono text-sm text-cream outline-none focus:border-lime/50"
                      />
                    </Field>
                  )}

                  {facadeMode === "facade_bitmap" && (
                    <Field label="Bitmap name">
                      <PixelSelect
                        value={String(facadeBitmap)}
                        onChange={(v) => setFacadeBitmap(v)}
                        options={facadeBitmapNames.map((n) => ({ value: n, label: n }))}
                        placeholder="— choose —"
                        className="w-full"
                        ariaLabel="Bitmap name"
                      />
                    </Field>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Roof ornament">
                      <PixelSelect
                        value={String(roofOrnament)}
                        onChange={(v) => setRoofOrnament(v as OrnamentName)}
                        options={ornamentNames.map((n) => ({ value: n, label: n }))}
                        className="w-full"
                        ariaLabel="Roof ornament"
                      />
                    </Field>
                    <Field label="Accent source">
                      <PixelSelect
                        value={String(accentSource)}
                        onChange={(v) => setAccentSource(v as AccentSource)}
                        options={[
                          { value: "theme", label: "theme (adapts)" },
                          { value: "locked", label: "locked (use accent)" },
                        ]}
                        className="w-full"
                        ariaLabel="Accent source"
                      />
                    </Field>
                  </div>
                </div>
              </Section>
            )}

            <Section title="ROTATION">
              <div className="space-y-3">
                <Field label="Priority" hint="0-1000 · 50=free · 100=standard · 200+=boosted">
                  <input
                    type="number"
                    value={priority}
                    min={0}
                    max={1000}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                </Field>
                <Field
                  label="Owner GitHub logins"
                  hint="comma-separated. Listed logins always see this landmark."
                >
                  <input
                    type="text"
                    value={ownersCsv}
                    onChange={(e) => setOwnersCsv(e.target.value)}
                    placeholder="alice, bob"
                    className="w-full border border-border bg-bg-raised px-3 py-2 text-sm text-cream outline-none focus:border-lime/50"
                  />
                </Field>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-cream">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Show in rotation
                </label>
              </div>
            </Section>

            {mode === "edit" && (
              <Section title="ACTIONS">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canSendWelcome || sendingWelcome}
                    onClick={handleSendWelcome}
                    className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream disabled:opacity-40"
                  >
                    {sendingWelcome ? "SENDING…" : "SEND WELCOME EMAIL"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="cursor-pointer border border-red-800/50 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-900/20"
                  >
                    HIDE LANDMARK
                  </button>
                </div>
              </Section>
            )}
          </div>

          {/* Preview column (sticky on desktop) */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <LivePreview
              slug={slug}
              name={name}
              tagline={tagline}
              description={description}
              url={url}
              features={features}
              accent={accent}
              buildingKind={buildingKind}
              customComponent={customComponent}
              templateConfig={previewTemplate}
              hitboxRadius={hitboxRadius}
              hitboxHeight={hitboxHeight}
            />
            <p className="mt-2 text-[10px] text-muted">
              Preview uses your accent as the theme color so changes are visible live. In the
              actual city, <span className="text-cream">accent_source=theme</span> will rotate
              with the active city theme.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-bg-raised/30 p-4">
      <p className="mb-2 text-[10px] text-dim">{title}</p>
      {hint && <p className="mb-2 text-[10px] text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] text-dim">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

function Radio({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-xs ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5"
      />
      <span className="text-cream">
        {label}
        {hint && <span className="ml-2 text-dim">— {hint}</span>}
      </span>
    </label>
  );
}
