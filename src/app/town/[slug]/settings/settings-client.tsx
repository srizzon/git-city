"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PixelSpinner, { Pending } from "@/components/leagues/PixelSpinner";
import { Avatar, NO_AUTOFILL } from "@/components/league/hud/shared";
import type { JoinRequest, League } from "@/lib/leagues/service";
import { REQUEST_TTL_DAYS, type JoinMode } from "@/lib/towns/joining";
import type { LeagueMemberRow } from "@/lib/leagues/queries";

type Result = { ok: true } | { ok: false; error: string };

async function send(url: string, method: "PATCH" | "DELETE" | "POST", body?: Record<string, string | boolean>): Promise<Result> {
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
  inviteLink,
  requests,
}: {
  league: League;
  members: LeagueMemberRow[];
  viewerLogin: string;
  /** Custom leagues: the open invite link (carries the invite token). */
  inviteLink: string | null;
  requests: JoinRequest[];
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const api = `/api/leagues/${league.slug}`;
  const refresh = () => startRefresh(() => router.refresh());

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Link href={`/town/${league.slug}`} className="text-xs text-muted transition-colors hover:text-cream">
            &larr; Back to the city
          </Link>
          {refreshing && <PixelSpinner size={4} />}
        </div>
        <h1 className="mt-6 text-2xl text-cream normal-case">{league.name}</h1>
        <p className="mt-1 text-[11px] text-muted">Town settings</p>

        <div className="mt-6 space-y-4">
          {league.kind === "custom" && (league.join_mode === "request" || requests.length > 0) && (
            <RequestsSection slug={league.slug} requests={requests} onChanged={refresh} />
          )}
          {league.kind === "custom" && <NameSection api={api} name={league.name} onSaved={refresh} />}
          {league.kind === "custom" && <JoinModeSection api={api} mode={league.join_mode} onSaved={refresh} />}
          {inviteLink && <InviteLinkSection api={api} link={inviteLink} onRotated={refresh} />}
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
          aria-label="Town name"
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

// ─── Invite link ─────────────────────────────────────────────

function InviteLinkSection({ api, link, onRotated }: { api: string; link: string; onRotated: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy. Select the link and copy it.");
    }
  }

  async function rotate() {
    setRotating(true);
    setError(null);
    const r = await send(api, "PATCH", { rotate_invite: true });
    setRotating(false);
    setConfirming(false);
    if (!r.ok) return setError(r.error);
    onRotated();
  }

  return (
    <Section title="Invite link" hint="Anyone with this link can join. Make a new one to turn the old link off.">
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-[11px] text-cream normal-case outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className={`btn-press min-w-[80px] px-3 text-[10px] ${copied ? "bg-lime text-bg" : "border-2 border-lime text-lime"}`}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-[9px] text-muted">The old link stops working.</span>
            <button
              type="button"
              disabled={rotating}
              onClick={rotate}
              className="btn-press min-w-[96px] border-2 border-red-500 px-2 py-1 text-[9px] text-red-400 disabled:opacity-50"
            >
              {rotating ? <Pending label="Making" /> : "New link"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="px-1 text-[9px] text-muted hover:text-cream">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="btn-press px-0 py-1 text-[9px] text-muted hover:text-cream">
            Make a new link
          </button>
        )}
      </div>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Who can join ────────────────────────────────────────────

const JOIN_OPTIONS: { id: JoinMode; label: string; hint: string }[] = [
  { id: "open", label: "Anyone", hint: "Anyone signed in joins with one click." },
  { id: "request", label: "Ask first", hint: "Newcomers ask, you let them in." },
  { id: "invite", label: "Invite only", hint: "Only your invites and your link." },
];

function JoinModeSection({ api, mode, onSaved }: { api: string; mode: JoinMode; onSaved: () => void }) {
  const [saving, setSaving] = useState<JoinMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: JoinMode) {
    setSaving(id);
    setError(null);
    const r = await send(api, "PATCH", { join_mode: id });
    setSaving(null);
    if (!r.ok) return setError(r.error);
    onSaved();
  }

  return (
    <Section title="Who can join" hint="Invites and your invite link always work.">
      <div className="grid gap-2 sm:grid-cols-3">
        {JOIN_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={mode === o.id}
            disabled={saving !== null || mode === o.id}
            onClick={() => pick(o.id)}
            className={`btn-press border-2 px-3 py-2.5 text-left ${mode === o.id ? "border-lime" : "border-border hover:border-border-light"}`}
          >
            <span className={`block text-[10px] ${mode === o.id ? "text-lime" : "text-cream"}`}>
              {saving === o.id ? <Pending label="Saving" /> : o.label}
            </span>
            <span className="mt-1 block text-[10px] text-muted normal-case">{o.hint}</span>
          </button>
        ))}
      </div>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Join requests ───────────────────────────────────────────

function since(iso: string | null): string | null {
  return iso ? `GitHub since ${new Date(iso).getUTCFullYear()}` : null;
}

function RequestsSection({ slug, requests, onChanged }: { slug: string; requests: JoinRequest[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(login: string, approve: boolean) {
    setBusy(`${login}:${approve ? "yes" : "no"}`);
    setError(null);
    const r = await send(`/api/leagues/${slug}/requests/${encodeURIComponent(login)}`, "POST", { approve });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    onChanged();
  }

  return (
    <div id="requests" className="scroll-mt-6">
      <Section
        title={`Join requests${requests.length > 0 ? ` · ${requests.length}` : ""}`}
        hint={`Declining is quiet: they aren't told. Requests expire after ${REQUEST_TTL_DAYS} days.`}
      >
        {requests.length === 0 ? (
          <p className="text-[11px] text-dim normal-case">No requests right now.</p>
        ) : (
          <ul className="max-h-[420px] divide-y-2 divide-border overflow-y-auto border-2 border-border">
            {requests.map((r) => (
              <li key={r.login} className="flex items-center gap-3 px-3 py-2">
                <Avatar src={r.avatar_url} size={24} />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/dev/${r.login}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[11px] text-cream normal-case hover:text-lime"
                  >
                    @{r.login}
                  </a>
                  <p className="text-[9px] text-muted">
                    {[`${r.contributions.toLocaleString("en-US")} contributions`, since(r.account_created_at)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => decide(r.login, true)}
                    className="btn-press min-w-[76px] bg-lime px-2 py-1.5 text-[9px] text-bg disabled:opacity-50"
                  >
                    {busy === `${r.login}:yes` ? <Pending label="Letting in" /> : "Let in"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => decide(r.login, false)}
                    className="btn-press px-2 py-1.5 text-[9px] text-muted hover:text-red-400 disabled:opacity-50"
                  >
                    {busy === `${r.login}:no` ? <Pending label="Declining" /> : "Decline"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ErrorLine error={error} />
      </Section>
    </div>
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
    const url = `${window.location.origin}/town/${league.slug}?ref=${encodeURIComponent(viewerLogin)}&invite=${encodeURIComponent(login)}`;
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
        "Removed members leave the city. Only a new invite from you brings them back."
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
    router.push(`/town/${league.slug}`);
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
    router.push("/towns");
  }

  return (
    <Section title="Delete town" hint="Removes the city, the members and the hall of fame. This can't be undone." danger>
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
      <p className="mt-2 text-[10px] text-dim normal-case">Type the town name to confirm.</p>
      <ErrorLine error={error} />
    </Section>
  );
}
