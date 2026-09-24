"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PixelSpinner, { Pending } from "@/components/leagues/PixelSpinner";
import { Avatar, NO_AUTOFILL } from "@/components/league/hud/shared";
import type { League } from "@/lib/leagues/service";
import type { LeagueMemberRow } from "@/lib/leagues/queries";

type Result = { ok: true } | { ok: false; error: string };

async function send(url: string, method: "PATCH" | "DELETE", body?: Record<string, string>): Promise<Result> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json.error ?? "Couldn't save." };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

function Section({ title, hint, children, danger = false }: { title: string; hint?: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className={`border-[3px] bg-bg-card p-4 ${danger ? "border-red-900/70" : "border-border"}`}>
      <h2 className={`text-sm ${danger ? "text-red-400" : "text-cream"}`}>{title}</h2>
      {hint && <p className="mt-1 text-[11px] text-muted normal-case">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p> : null;
}

export default function SettingsClient({
  league,
  members,
  viewerLogin,
}: {
  league: League;
  members: LeagueMemberRow[];
  viewerLogin: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const api = `/api/leagues/${league.slug}`;
  const refresh = () => startRefresh(() => router.refresh());

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Link href={`/league/${league.slug}`} className="text-xs text-muted transition-colors hover:text-cream">
            &larr; Back to the city
          </Link>
          {refreshing && <PixelSpinner size={4} />}
        </div>
        <h1 className="mt-6 text-2xl text-cream normal-case">{league.name}</h1>
        <p className="mt-1 text-[11px] text-muted">League settings</p>

        <div className="mt-6 space-y-4">
          <NameSection api={api} name={league.name} onSaved={refresh} />
          <ScoringSection api={api} mode={league.scoring_mode} onSaved={refresh} />
          <MembersSection league={league} members={members} viewerLogin={viewerLogin} onChanged={refresh} />
          <TransferSection api={api} league={league} members={members} viewerLogin={viewerLogin} />
          {league.kind === "custom" && <DeleteSection api={api} name={league.name} />}
        </div>
      </div>
    </main>
  );
}

// ─── Name ────────────────────────────────────────────────────

function NameSection({ api, name, onSaved }: { api: string; name: string; onSaved: () => void }) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = value.trim() !== name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    const r = await send(api, "PATCH", { name: value });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setSaved(true);
    onSaved();
  }

  return (
    <Section title="Name">
      <form onSubmit={save} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          maxLength={40}
          aria-label="League name"
          {...NO_AUTOFILL}
          className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-xs"
        />
        <button
          type="submit"
          disabled={!dirty || saving}
          className="btn-press min-w-[80px] border-2 border-lime px-3 py-2 text-[10px] text-lime disabled:opacity-40"
        >
          {saving ? <Pending label="Saving" /> : saved && !dirty ? "Saved" : "Save"}
        </button>
      </form>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Scoring ─────────────────────────────────────────────────

function ScoringSection({ api, mode, onSaved }: { api: string; mode: "xp" | "contributions"; onSaved: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: "xp" | "contributions") {
    setSaving(id);
    setError(null);
    const r = await send(api, "PATCH", { scoring_mode: id });
    setSaving(null);
    if (!r.ok) return setError(r.error);
    onSaved();
  }

  return (
    <Section title="Scoring" hint="How the weekly race is scored. Takes effect right away.">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["xp", "Code + game XP"],
            ["contributions", "Code only"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            disabled={saving !== null || mode === id}
            onClick={() => pick(id)}
            className={`btn-press min-w-[120px] border-2 px-3 py-2 text-[10px] ${mode === id ? "border-lime text-lime" : "border-border text-muted hover:text-cream"}`}
          >
            {saving === id ? <Pending label="Saving" /> : label}
          </button>
        ))}
      </div>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Members ─────────────────────────────────────────────────

function MembersSection({
  league,
  members,
  viewerLogin,
  onChanged,
}: {
  league: League;
  members: LeagueMemberRow[];
  viewerLogin: string;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...members].sort((a, b) => (a.status === b.status ? a.login.localeCompare(b.login) : a.status === "active" ? -1 : 1));

  async function copyLink(login: string) {
    const url = `${window.location.origin}/league/${league.slug}?ref=${encodeURIComponent(viewerLogin)}&invite=${encodeURIComponent(login)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(login);
      setTimeout(() => setCopied((c) => (c === login ? null : c)), 1800);
    } catch {
      setError("Couldn't copy. Copy it from the address bar instead.");
    }
  }

  async function remove(login: string) {
    setRemoving(login);
    setError(null);
    const r = await send(`/api/leagues/${league.slug}/members/${encodeURIComponent(login)}`, "DELETE");
    setRemoving(null);
    setConfirming(null);
    if (!r.ok) return setError(r.error);
    onChanged();
  }

  return (
    <Section
      title={`Members · ${members.length}`}
      hint={
        league.kind === "company"
          ? "Removed members leave the city. They can come back by verifying again."
          : "Removed members leave the city. They need a new invite to come back."
      }
    >
      <ul className="max-h-[420px] divide-y-2 divide-border overflow-y-auto border-2 border-border">
        {sorted.map((m) => {
          const me = m.login === viewerLogin;
          return (
            <li key={m.developer_id} className="flex items-center gap-3 px-3 py-2">
              <Avatar src={m.avatar_url} size={24} faded={m.status === "invited"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-cream normal-case">
                  @{m.login}
                  {me && <span className="ml-2 text-[9px] text-lime uppercase">Admin</span>}
                </p>
                <p className={`text-[9px] ${m.status === "active" ? "text-muted" : "text-dim"}`}>
                  {m.status === "active" ? (m.verification ? `Joined · ${m.verification} verification` : "Joined") : "Invited · not joined yet"}
                </p>
              </div>
              {confirming === m.login ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[9px] text-muted">Remove?</span>
                  <button
                    type="button"
                    disabled={removing !== null}
                    onClick={() => remove(m.login)}
                    className="btn-press min-w-[72px] border-2 border-red-500 px-2 py-1 text-[9px] text-red-400 disabled:opacity-50"
                  >
                    {removing === m.login ? <Pending label="Removing" /> : "Remove"}
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="px-1 text-[9px] text-muted hover:text-cream">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  {m.status === "invited" && (
                    <button
                      type="button"
                      onClick={() => copyLink(m.login)}
                      className="btn-press min-w-[76px] border-2 border-border px-2 py-1 text-[9px] text-cream hover:border-lime"
                    >
                      {copied === m.login ? "Copied" : "Copy link"}
                    </button>
                  )}
                  {!me && (
                    <button
                      type="button"
                      onClick={() => setConfirming(m.login)}
                      className="btn-press px-2 py-1 text-[9px] text-muted hover:text-red-400"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Transfer admin ──────────────────────────────────────────

function TransferSection({
  api,
  league,
  members,
  viewerLogin,
}: {
  api: string;
  league: League;
  members: LeagueMemberRow[];
  viewerLogin: string;
}) {
  const router = useRouter();
  const candidates = members.filter(
    (m) => m.status === "active" && m.login !== viewerLogin && (league.kind === "custom" || m.verification),
  );
  const [target, setTarget] = useState(candidates[0]?.login ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    if (!target || saving) return;
    setSaving(true);
    setError(null);
    const r = await send(api, "PATCH", { admin_login: target });
    if (!r.ok) {
      setSaving(false);
      return setError(r.error);
    }
    // No longer admin: back to the city.
    router.push(`/league/${league.slug}`);
  }

  return (
    <Section title="Transfer admin" hint="The new admin gets these settings. You stay a member.">
      {candidates.length === 0 ? (
        <p className="text-[11px] text-dim normal-case">
          {league.kind === "company" ? "Nobody else has verified yet." : "Nobody else has joined yet."}
        </p>
      ) : (
        <form onSubmit={transfer} className="flex flex-wrap gap-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="New admin"
            className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-2 py-2 text-base text-cream normal-case sm:text-[11px]"
          >
            {candidates.map((m) => (
              <option key={m.developer_id} value={m.login}>
                @{m.login}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving} className="btn-press min-w-[100px] border-2 border-border px-3 py-2 text-[10px] text-cream disabled:opacity-50">
            {saving ? <Pending label="Moving" /> : "Transfer"}
          </button>
        </form>
      )}
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Delete ──────────────────────────────────────────────────

function DeleteSection({ api, name }: { api: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = value.trim().toLowerCase() === name.trim().toLowerCase();

  async function del(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    const r = await send(api, "DELETE", { confirm: value });
    if (!r.ok) {
      setDeleting(false);
      return setError(r.error);
    }
    router.push("/leagues");
  }

  return (
    <Section title="Delete league" hint="Removes the city, the members and the hall of fame. This can't be undone." danger>
      <form onSubmit={del} className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={name}
          aria-label={`Type ${name} to confirm`}
          {...NO_AUTOFILL}
          className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-red-500 sm:text-xs"
        />
        <button
          type="submit"
          disabled={!matches || deleting}
          className="btn-press min-w-[100px] border-2 border-red-500 px-3 py-2 text-[10px] text-red-400 disabled:opacity-40"
        >
          {deleting ? <Pending label="Deleting" /> : "Delete"}
        </button>
      </form>
      <p className="mt-2 text-[10px] text-dim normal-case">Type the league name to confirm.</p>
      <ErrorLine error={error} />
    </Section>
  );
}
