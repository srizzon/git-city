"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RELATIONSHIP_LABELS } from "@/lib/portfolio/constants";
import type { EndorsementAggregate } from "@/lib/portfolio/types";

interface Props {
  targetUsername: string;
  skills: string[];
  endorsements: EndorsementAggregate[];
  endorsementCount: number;
  isLoggedIn: boolean;
  isOwner: boolean;
}

const RELATIONSHIPS = Object.entries(RELATIONSHIP_LABELS);

export default function EndorseButton({
  targetUsername,
  skills,
  endorsements: initialEndorsements,
  endorsementCount: initialCount,
  isLoggedIn,
  isOwner,
}: Props) {
  const [endorsements, setEndorsements] = useState(initialEndorsements);
  const [endorsementCount, setEndorsementCount] = useState(initialCount);
  const [panelOpen, setPanelOpen] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [contextText, setContextText] = useState("");
  const [relationship, setRelationship] = useState("worked_together");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSuccess(false);
    setSkillName("");
    setContextText("");
    setRelationship("worked_together");
    setError("");
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  useEffect(() => {
    if (!panelOpen || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, input, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
  }, [panelOpen]);

  async function submit() {
    if (!skillName.trim() || contextText.trim().length < 10) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/portfolio/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: targetUsername,
          skill_name: skillName.trim().toLowerCase(),
          context_text: contextText.trim(),
          relationship,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      // Update local state
      setEndorsementCount((c) => c + 1);
      const existing = endorsements.find((e) => e.skill === skillName.trim().toLowerCase());
      if (existing) {
        setEndorsements((prev) =>
          prev.map((e) =>
            e.skill === skillName.trim().toLowerCase()
              ? { ...e, count: e.count + 1 }
              : e
          )
        );
      } else {
        setEndorsements((prev) => [
          ...prev,
          { skill: skillName.trim().toLowerCase(), count: 1, top: [] },
        ]);
      }

      setSuccess(true);
      setTimeout(closePanel, 2500);
    } finally {
      setSaving(false);
    }
  }

  // Don't show empty endorsements section unless someone can actually endorse
  const canEndorse = isLoggedIn && !isOwner;
  if (endorsements.length === 0 && !canEndorse) return null;

  return (
    <>
      {/* ─── Endorsements Section ─── */}
      <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs text-muted/50 tracking-[0.15em]">
            {endorsementCount > 0
              ? `Endorsed by ${endorsementCount} developer${endorsementCount !== 1 ? "s" : ""}`
              : "Endorsements"}
          </h2>
          {canEndorse && (
            <button
              ref={triggerRef}
              onClick={() => setPanelOpen(true)}
              className="cursor-pointer border-[3px] border-[#c8e64a]/30 px-4 py-1.5 text-xs text-[#c8e64a] transition-colors hover:border-[#c8e64a] hover:bg-[#c8e64a]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
            >
              + Endorse
            </button>
          )}
        </div>

        {endorsements.length > 0 ? (
          <>
            <div className="space-y-3 mb-6">
              {endorsements
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
                .map((e) => {
                  const maxCount = Math.max(...endorsements.map((x) => x.count), 1);
                  return (
                    <div key={e.skill} className="flex items-center gap-4">
                      <span className="w-32 shrink-0 truncate text-sm text-cream text-right">
                        {e.skill}
                      </span>
                      <div className="flex-1 h-3 bg-border/30">
                        <div
                          className="h-full bg-[#c8e64a] transition-all"
                          style={{ width: `${(e.count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-sm text-muted text-right">{e.count}</span>
                    </div>
                  );
                })}
            </div>
            {endorsements.some((e) => e.top.length > 0) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {endorsements
                  .filter((e) => e.top.length > 0)
                  .slice(0, 2)
                  .map((e) => {
                    const t = e.top[0];
                    return (
                      <div key={`${e.skill}-${t.github_login}`} className="border-l-2 border-[#c8e64a]/30 pl-4">
                        <p className="text-sm text-cream/80 normal-case leading-relaxed">
                          &ldquo;{t.context_text}&rdquo;
                        </p>
                        <p className="mt-2 text-xs text-muted">
                          &mdash; @{t.github_login} ·{" "}
                          {RELATIONSHIP_LABELS[t.relationship] ?? t.relationship}
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-muted/40 normal-case">
              No endorsements yet.
            </p>
            {canEndorse && (
              <button
                ref={triggerRef}
                onClick={() => setPanelOpen(true)}
                className="cursor-pointer mt-3 border-[3px] border-[#c8e64a]/30 px-5 py-2.5 text-xs text-[#c8e64a] transition-colors hover:border-[#c8e64a] hover:bg-[#c8e64a]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
              >
                Be the first to endorse
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Endorse Panel ─── */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={closePanel}
          role="dialog"
          aria-modal="true"
          aria-label={`Endorse @${targetUsername}`}
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
                  Endorse @{targetUsername}
                </h2>
                <button
                  onClick={closePanel}
                  aria-label="Close panel"
                  className="cursor-pointer text-muted hover:text-cream text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 rounded-sm p-1"
                >
                  &times;
                </button>
              </div>

              {success ? (
                <div className="py-12 text-center">
                  <p className="text-lg text-[#c8e64a]">Endorsement sent!</p>
                  <p className="mt-2 text-sm text-muted normal-case">+50 XP for being generous.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Skill */}
                  <div>
                    <label className="block text-xs text-muted font-pixel uppercase mb-1.5">
                      Skill *
                    </label>
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {skills.map((s) => (
                          <button
                            key={s}
                            onClick={() => setSkillName(s)}
                            className={`cursor-pointer border-[2px] px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 ${
                              skillName === s
                                ? "border-[#c8e64a] text-[#c8e64a] bg-[#c8e64a]/10"
                                : "border-border text-muted hover:border-border-light"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      value={skillName}
                      onChange={(e) => setSkillName(e.target.value)}
                      placeholder="Or type a skill..."
                      maxLength={50}
                      className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                    />
                  </div>

                  {/* Context */}
                  <div>
                    <label className="block text-xs text-muted font-pixel uppercase mb-1.5">
                      How do you know? *
                    </label>
                    <textarea
                      value={contextText}
                      onChange={(e) => setContextText(e.target.value)}
                      placeholder="We built the payment system together at Acme Corp..."
                      maxLength={280}
                      rows={3}
                      className="w-full bg-bg border-[3px] border-border px-3 py-2.5 text-sm text-cream normal-case placeholder:text-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 resize-none"
                    />
                    <p className="mt-1 text-right text-[10px] text-muted/30">
                      {contextText.length}/280 (min 10)
                    </p>
                  </div>

                  {/* Relationship */}
                  <div>
                    <label className="block text-xs text-muted font-pixel uppercase mb-1.5">
                      Relationship
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {RELATIONSHIPS.map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setRelationship(key)}
                          className={`cursor-pointer border-[2px] px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 ${
                            relationship === key
                              ? "border-cream text-cream"
                              : "border-border text-muted hover:border-border-light"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs text-red-400 normal-case">{error}</p>
                  )}

                  <button
                    onClick={submit}
                    disabled={saving || !skillName.trim() || contextText.trim().length < 10}
                    className="cursor-pointer w-full py-3 text-sm text-bg font-pixel uppercase transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50"
                    style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #8fa832" }}
                  >
                    {saving ? "Sending..." : "Send endorsement"}
                  </button>

                  <p className="text-center text-[10px] text-muted/30 normal-case">
                    You have 3 endorsements per month. Use them wisely.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
