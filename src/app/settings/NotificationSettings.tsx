"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Prefs {
  email_enabled: boolean;
  social: boolean;
  digest: boolean;
  marketing: boolean;
  streak_reminders: boolean;
  jobs_applications: boolean;
  jobs_performance: boolean;
  jobs_digest: boolean;
  jobs_updates: boolean;
  leagues: boolean;
  digest_frequency: string;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

const DEFAULT_PREFS: Prefs = {
  email_enabled: true,
  social: true,
  digest: true,
  marketing: false,
  streak_reminders: true,
  jobs_applications: true,
  jobs_performance: true,
  jobs_digest: true,
  jobs_updates: true,
  leagues: true,
  digest_frequency: "realtime",
  quiet_hours_start: null,
  quiet_hours_end: null,
};

function Toggle({ checked, onChange, label, sublabel, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between cursor-pointer group ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div>
        <span className="text-sm text-cream normal-case">{label}</span>
        {sublabel && <p className="text-xs text-muted/40 normal-case mt-0.5">{sublabel}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 border-[3px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 ${
          checked ? "border-[#c8e64a] bg-[#c8e64a]/10" : "border-border bg-transparent"
        }`}
      >
        <span
          className={`block h-3 w-3 transition-all absolute top-[3px] ${
            checked ? "left-[22px]" : "left-[3px]"
          }`}
          style={{ backgroundColor: checked ? "#c8e64a" : "var(--color-muted)" }}
        />
      </button>
    </label>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => {
        if (r.status === 401) {
          setAuthError(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setPrefs({ ...DEFAULT_PREFS, ...data });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = useCallback(async (updates: Partial<Prefs>) => {
    // Use ref to avoid stale closure when user clicks multiple toggles quickly
    const current = prefsRef.current;
    const newPrefs = { ...current, ...updates };
    setPrefs(newPrefs);
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save preferences");
      setPrefs(current);
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
          <div className="h-3 w-20 animate-pulse bg-border" />
          <div className="mt-6 h-7 w-48 animate-pulse bg-border" />
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-4 w-32 animate-pulse bg-border" />
                <div className="h-6 w-11 animate-pulse bg-border" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12 text-center">
          <h1 className="text-2xl text-cream mb-4">Settings</h1>
          <p className="text-sm text-muted/40 normal-case mb-6">You need to be logged in to manage notification preferences.</p>
          <a href="/api/auth/github?redirect=/settings" className="inline-block border-[3px] border-[#c8e64a] px-6 py-3 text-xs text-[#c8e64a] transition-colors hover:bg-[#c8e64a]/10 cursor-pointer">
            Sign in with GitHub
          </a>
        </div>
      </main>
    );
  }

  const emailOff = !prefs.email_enabled;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => window.history.back()} className="text-sm text-muted transition-colors hover:text-cream cursor-pointer">
            &lt; Back
          </button>
          <div className="flex items-center gap-3">
            {saving && <span className="text-xs text-muted animate-pulse normal-case">Saving...</span>}
            {saved && <span className="text-xs text-[#c8e64a] normal-case">Saved</span>}
            {error && <span className="text-xs text-red-400 normal-case">{error}</span>}
          </div>
        </div>

        <h1 className="text-2xl text-cream mb-2">Settings</h1>
        <p className="text-sm text-muted/40 normal-case mb-8">Manage your notification preferences</p>

        {/* Master toggle */}
        <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8 mb-6">
          <Toggle
            checked={prefs.email_enabled}
            onChange={(v) => save({ email_enabled: v })}
            label="Email notifications"
            sublabel="Turn off all email notifications"
          />
          {emailOff && (
            <p className="mt-3 text-xs text-red-400/80 normal-case">
              All email notifications are disabled. You will only receive essential transactional emails (purchase receipts).
            </p>
          )}
        </div>

        {/* Game notifications */}
        <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8 mb-6">
          <h2 className="text-sm text-cream mb-5">Game</h2>
          <div className="space-y-5">
            <Toggle
              checked={prefs.streak_reminders}
              onChange={(v) => save({ streak_reminders: v })}
              label="Daily reminder"
              sublabel="Your streak or unfinished missions, at most once a day"
              disabled={emailOff}
            />
            <Toggle
              checked={prefs.social}
              onChange={(v) => save({ social: v })}
              label="Raids and social"
              sublabel="Raids on your building, gifts, rare emblems and referrals"
              disabled={emailOff}
            />
            <Toggle
              checked={prefs.leagues}
              onChange={(v) => save({ leagues: v })}
              label="Towns"
              sublabel="Weekly results, overtakes and teammates lighting up"
              disabled={emailOff}
            />
            <Toggle
              checked={prefs.digest}
              onChange={(v) => save({ digest: v })}
              label="Weekly recap"
              sublabel="Mondays, only when something happened in your week"
              disabled={emailOff}
            />
            <Toggle
              checked={prefs.marketing}
              onChange={(v) => save({ marketing: v })}
              label="Product updates"
              sublabel="New features and announcements"
              disabled={emailOff}
            />
          </div>
        </div>

        {/* Jobs notifications */}
        <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8 mb-6">
          <h2 className="text-sm text-cream mb-5">Jobs</h2>
          <div className="space-y-5">
            <Toggle
              checked={prefs.jobs_digest}
              onChange={(v) => save({ jobs_digest: v })}
              label="Weekly job matches"
              sublabel="New jobs that match your skills and preferences"
              disabled={emailOff}
            />
            <Toggle
              checked={prefs.jobs_updates}
              onChange={(v) => save({ jobs_updates: v })}
              label="Application updates"
              sublabel="When a job you applied to is filled or updated"
              disabled={emailOff}
            />
          </div>
        </div>

        {/* Raid alert bundling (digest_frequency: realtime or not) */}
        <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
          <h2 className="text-sm text-cream mb-2">Raid alerts</h2>
          <p className="text-xs text-muted/40 normal-case mb-5">
            One email per raid, or several raids bundled into one email
          </p>
          <div className="flex flex-wrap gap-2">
            {(["realtime", "daily"] as const).map((freq) => (
              <button
                key={freq}
                onClick={() => save({ digest_frequency: freq })}
                disabled={emailOff}
                className={`border-[3px] px-4 py-2.5 text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e64a]/50 ${
                  (freq === "realtime") === (prefs.digest_frequency === "realtime")
                    ? "border-[#c8e64a] text-[#c8e64a] bg-[#c8e64a]/10"
                    : "border-border text-muted hover:border-border-light"
                } ${emailOff ? "opacity-40 pointer-events-none" : ""}`}
              >
                {freq === "realtime" ? "Instant" : "Bundled"}
              </button>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-xs text-muted/30 normal-case text-center">
          Receipts and account emails always arrive.
          <br />
          Every other email has a one-click unsubscribe for its own category.
        </p>
      </div>
    </main>
  );
}
