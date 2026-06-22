"use client";

import { useCallback, useEffect, useState } from "react";
import { SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform } from "@/lib/social-links";
import { PixelSocialIcon, SocialLinkChip, SOCIAL_LABELS } from "@/components/SocialIcons";

interface Props {
  login: string;
  initialLinks: SocialLinks;
  isOwner: boolean;
  color: string;
}

const PLACEHOLDERS: Record<SocialPlatform, string> = {
  linkedin: "linkedin.com/in/you",
  twitter: "@handle or x.com/handle",
  youtube: "youtube.com/@channel",
  website: "https://yoursite.dev",
  email: "you@domain.com",
};

type FormState = Record<SocialPlatform, string>;

const emptyForm = (links: SocialLinks): FormState =>
  Object.fromEntries(
    SOCIAL_PLATFORMS.map((p) => [p, (links[p] ?? "").replace(/^mailto:/, "")])
  ) as FormState;

export default function SocialLinksRow({ login, initialLinks, isOwner, color }: Props) {
  const [links, setLinks] = useState<SocialLinks>(initialLinks);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(initialLinks));
  const [fieldError, setFieldError] = useState<{ field: SocialPlatform; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  const hasLinks = SOCIAL_PLATFORMS.some((p) => links[p]);

  // No GitHub chip here — the profile footer already links to GitHub.
  // Visitors only see the row when there are actual links; owners always
  // get the edit chip so they can add some.
  if (!isOwner && !hasLinks) return null;

  const openEditor = useCallback(async () => {
    setFieldError(null);
    setOpen(true);
    setLoadingSuggest(true);
    try {
      // Fresh read (the page is ISR-cached) + GitHub suggestions when nothing saved yet.
      const res = await fetch(`/api/social-links?login=${encodeURIComponent(login)}&suggest=1`);
      if (res.ok) {
        const data = (await res.json()) as { links: SocialLinks; suggested: SocialLinks };
        setLinks(data.links);
        setForm(emptyForm({ ...data.suggested, ...data.links }));
      }
    } catch {
      // keep whatever the server rendered
    } finally {
      setLoadingSuggest(false);
    }
  }, [login]);

  // ESC closes the editor
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setFieldError(null);
    try {
      const res = await fetch("/api/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        links?: SocialLinks;
        error?: string;
        field?: SocialPlatform;
      };
      if (res.ok && data.links) {
        setLinks(data.links);
        setOpen(false);
      } else {
        setFieldError({
          field: data.field ?? "linkedin",
          msg: data.error ?? "Couldn't save",
        });
      }
    } catch {
      setFieldError({ field: "linkedin", msg: "Network error - try again" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
      {SOCIAL_PLATFORMS.map((p) =>
        links[p] ? <SocialLinkChip key={p} name={p} href={links[p]!} hoverColor={color} /> : null
      )}

      {isOwner && (
        <button
          onClick={openEditor}
          title="Edit links"
          aria-label="Edit links"
          className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 border-2 border-dashed border-border-light px-2 text-[8px] tracking-wider text-dim transition-colors hover:border-border-light hover:text-cream"
        >
          <PixelSocialIcon name="pencil" size={12} />
          {!hasLinks && <span>+ LINKS</span>}
        </button>
      )}

      {/* Edit modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm border-[3px] border-border bg-bg-raised pixel-shadow">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
              <span className="text-[10px] tracking-widest text-cream">SOCIAL LINKS</span>
              <button
                onClick={() => setOpen(false)}
                className="text-[10px] text-muted transition-colors hover:text-cream"
              >
                ESC
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4">
              {SOCIAL_PLATFORMS.map((p) => (
                <div key={p}>
                  <label className="mb-1 flex items-center gap-1.5 text-[8px] tracking-widest text-dim">
                    <PixelSocialIcon name={p} size={12} />
                    {SOCIAL_LABELS[p].toUpperCase()}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={form[p]}
                      disabled={loadingSuggest}
                      onChange={(e) => setForm((f) => ({ ...f, [p]: e.target.value }))}
                      placeholder={loadingSuggest ? "..." : PLACEHOLDERS[p]}
                      className={`w-full border-2 bg-bg px-2 py-1.5 text-[10px] normal-case text-cream outline-none transition-colors placeholder:text-dim focus:border-border-light disabled:opacity-50 ${
                        fieldError?.field === p ? "border-red-500/70" : "border-border"
                      }`}
                    />
                    {form[p] && (
                      <button
                        onClick={() => setForm((f) => ({ ...f, [p]: "" }))}
                        title={`Clear ${SOCIAL_LABELS[p]}`}
                        aria-label={`Clear ${SOCIAL_LABELS[p]}`}
                        className="shrink-0 border-2 border-border px-1.5 py-1 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  {fieldError?.field === p && (
                    <p className="mt-1 text-[8px] normal-case text-red-400">{fieldError.msg}</p>
                  )}
                </div>
              ))}

              <p className="text-[8px] leading-relaxed normal-case text-dim">
                Paste a URL or just your handle. Empty field = icon hidden.
              </p>

              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="border-2 border-border px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
                >
                  CANCEL
                </button>
                <button
                  onClick={save}
                  disabled={saving || loadingSuggest}
                  className="border-2 border-lime-dark bg-lime px-3 py-1.5 text-[10px] font-bold text-bg pixel-shadow-lime btn-press disabled:opacity-60"
                >
                  {saving ? (
                    <span>
                      SAVING<span className="blink-dot">_</span>
                    </span>
                  ) : (
                    "SAVE"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
