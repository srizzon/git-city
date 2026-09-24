"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { generateCityLayout, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import { usePerfMode } from "@/lib/perfMode";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import type { LeaguePageData } from "@/lib/leagues/queries";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), { ssr: false });

type Tab = "week" | "hall";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function nextMondayUtc(now: number): number {
  const d = new Date(now);
  const day = d.getUTCDay();
  const add = day === 1 ? 7 : (8 - day) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add);
}

function useCountdown(): string {
  const [left, setLeft] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const ms = nextMondayUtc(Date.now()) - Date.now();
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLeft(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return left;
}

function Avatar({ src, size = 28, dark = false }: { src: string | null; size?: number; dark?: boolean }) {
  if (!src) return <div className="shrink-0 bg-bg-raised" style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      style={{ width: size, height: size, imageRendering: "pixelated", filter: dark ? "grayscale(1) brightness(0.6)" : undefined }}
    />
  );
}

export default function LeagueClient({
  data,
  cityDevs,
  cityNorms,
  topCompanyLastWeek,
  invite,
  refLogin,
}: {
  data: LeaguePageData;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  topCompanyLastWeek: boolean;
  invite: string | null;
  refLogin: string | null;
}) {
  const { league, week, members, hall_of_fame, viewer, counts } = data;
  const { mode: perfMode } = usePerfMode();
  const [tab, setTab] = useState<Tab>("week");
  const countdown = useCountdown();

  const layout = useMemo(
    () => generateCityLayout(cityDevs as unknown as DeveloperRecord[], undefined, cityNorms),
    [cityDevs, cityNorms],
  );

  const isMember = viewer?.status === "active";
  const invitedMember = invite ? members.find((m) => m.login.toLowerCase() === invite) : undefined;
  const showJoinCta = !isMember && (!!invite || viewer?.status === "invited");
  const dark = members.filter((m) => m.status === "invited");

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-muted transition-colors hover:text-cream">
            &larr; City
          </Link>
          <Link href="/leagues" className="text-xs text-muted transition-colors hover:text-cream">
            All leagues &rarr;
          </Link>
        </div>

        {/* Header */}
        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-[9px]">
            <span className="border-2 border-border px-2 py-0.5 text-muted">
              {league.kind === "company" ? `Company · @${league.github_org}` : "Custom league"}
            </span>
            {topCompanyLastWeek && (
              <span className="border-2 border-lime px-2 py-0.5 text-lime">Top company last week</span>
            )}
          </div>
          <h1 className="mt-3 text-3xl text-cream normal-case md:text-4xl">{league.name}</h1>
          <p className="mt-2 text-[11px] text-muted">
            {fmt(counts.total)} buildings · {fmt(counts.active)} lit · {fmt(counts.dark)} dark
          </p>
        </header>

        {showJoinCta && (
          <JoinCta
            leagueSlug={league.slug}
            leagueKind={league.kind}
            signedIn={!!viewer}
            viewerInvited={viewer?.status === "invited"}
            invitee={invitedMember?.login ?? invite}
            refLogin={refLogin}
          />
        )}

        {/* Mini-city */}
        <section className="mt-6 border-[3px] border-border bg-bg-raised">
          <div className="relative h-[300px] w-full overflow-hidden sm:h-[420px]">
            {layout.buildings.length > 0 ? (
              <CityCanvas
                buildings={layout.buildings}
                plazas={layout.plazas}
                decorations={layout.decorations}
                river={layout.river}
                bridges={layout.bridges}
                flyMode={false}
                onExitFly={() => {}}
                themeIndex={0}
                introMode={false}
                perfMode={perfMode}
                containerStyle={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                hideLandmarks
                cameraFit
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-muted">No buildings yet</div>
            )}
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-8 flex gap-2" role="tablist">
          {(
            [
              ["week", "This week"],
              ["hall", "Hall of fame"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`btn-press border-2 px-3 py-2 text-[11px] ${
                tab === id ? "border-lime text-lime" : "border-border text-muted hover:text-cream"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "week" ? (
          <section className="mt-4">
            <div className="flex items-baseline justify-between text-[10px] text-muted">
              <span>{week.mode === "xp" ? "Code + game XP" : "Code only"}</span>
              <span>Closes in {countdown || "…"}</span>
            </div>
            <ol className="mt-3 space-y-1.5">
              {week.standings.map((s) => {
                const me = viewer?.login === s.login;
                return (
                  <li
                    key={s.developer_id}
                    className={`flex items-center gap-3 border-[3px] bg-bg-card px-3 py-2 ${me ? "border-lime" : "border-border"}`}
                  >
                    <span className={`w-6 text-right text-xs ${s.rank === 1 ? "text-lime" : "text-muted"}`}>{s.rank}</span>
                    <Avatar src={s.avatar_url} />
                    <Link href={`/dev/${s.login}`} className="min-w-0 flex-1 truncate text-xs text-cream normal-case hover:text-lime">
                      @{s.login}
                    </Link>
                    {week.mode === "xp" && (
                      <span className="hidden text-[9px] text-muted sm:inline">
                        {fmt(s.codePoints)} code · {fmt(s.gameXp)} xp
                      </span>
                    )}
                    <span className="w-14 text-right text-xs text-cream tabular-nums">{fmt(s.total)}</span>
                  </li>
                );
              })}
              {week.standings.length === 0 && (
                <li className="text-[11px] text-muted normal-case">Nobody has lit up yet.</li>
              )}
            </ol>

            {dark.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[10px] text-muted">Dark · waiting to light up</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {dark.map((m) => (
                    <li key={m.developer_id} className="flex items-center gap-1.5 border-2 border-border px-2 py-1">
                      <Avatar src={m.avatar_url} size={16} dark />
                      <span className="text-[10px] text-dim normal-case">@{m.login}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <HallOfFame members={members} hall={hall_of_fame} />
        )}

        {isMember && <InviteBox slug={league.slug} />}
        {viewer?.is_admin && <AdminBox slug={league.slug} mode={week.mode} members={members} viewerLogin={viewer.login} kind={league.kind} />}
        {!isMember && !showJoinCta && viewer && league.kind === "company" && (
          <Link
            href="/leagues/verify"
            className="btn-press mt-10 block border-2 border-border px-4 py-3 text-center text-[11px] text-cream hover:border-lime"
          >
            Work here? Verify your company
          </Link>
        )}
      </div>
    </main>
  );
}

// ─── Join CTA ────────────────────────────────────────────────

function JoinCta({
  leagueSlug,
  leagueKind,
  signedIn,
  viewerInvited,
  invitee,
  refLogin,
}: {
  leagueSlug: string;
  leagueKind: "company" | "custom";
  signedIn: boolean;
  viewerInvited: boolean;
  invitee: string | null;
  refLogin: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    const params = new URLSearchParams();
    if (refLogin) params.set("ref", refLogin);
    params.set("next", `/league/${leagueSlug}`);
    await signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?${params.toString()}`);
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueSlug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refLogin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't join.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const needsVerify = signedIn && leagueKind === "company";
  return (
    <section className="mt-6 border-[3px] border-lime bg-bg-card p-4">
      <p className="text-sm text-cream">Your team is waiting.</p>
      <p className="mt-1 text-[11px] text-muted normal-case">
        {invitee ? `@${invitee}'s building is dark. ` : ""}Light up your building to join the weekly race.
      </p>
      {needsVerify ? (
        <Link
          href="/leagues/verify"
          className="btn-press mt-4 block bg-lime px-4 py-3 text-center text-[11px] tracking-widest text-bg"
        >
          Verify your company
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={signedIn ? join : signIn}
          className="btn-press mt-4 w-full bg-lime px-4 py-3 text-[11px] tracking-widest text-bg disabled:opacity-50"
        >
          {busy ? "..." : signedIn ? (viewerInvited ? "Light up my building" : "Join league") : "Light up my building"}
        </button>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
    </section>
  );
}

// ─── Hall of fame ────────────────────────────────────────────

function HallOfFame({ members, hall }: { members: LeaguePageData["members"]; hall: LeaguePageData["hall_of_fame"] }) {
  const bySize = [...members].sort((a, b) => b.contributions - a.contributions).slice(0, 20);
  return (
    <section className="mt-4 grid gap-8 sm:grid-cols-2">
      <div>
        <h3 className="text-[10px] text-muted">Weekly winners</h3>
        <ul className="mt-2 space-y-1.5">
          {hall.map((w) => (
            <li key={w.week_start} className="flex items-center gap-2 border-[3px] border-border bg-bg-card px-3 py-2">
              <span className="w-16 shrink-0 text-[9px] text-muted">{w.week_start.slice(5)}</span>
              {w.winner ? (
                <>
                  <Avatar src={w.winner.avatar_url} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-cream normal-case">@{w.winner.login}</span>
                  {w.winner.ex_member && <span className="text-[8px] text-dim">ex-member</span>}
                  <span className="text-[10px] text-cream tabular-nums">{fmt(w.winner.score)}</span>
                </>
              ) : (
                <span className="flex-1 text-[10px] text-dim">No winner</span>
              )}
            </li>
          ))}
          {hall.length === 0 && <li className="text-[11px] text-muted normal-case">The first week hasn&apos;t closed yet.</li>}
        </ul>
      </div>
      <div>
        <h3 className="text-[10px] text-muted">Biggest buildings, all time</h3>
        <ol className="mt-2 space-y-1.5">
          {bySize.map((m, i) => (
            <li key={m.developer_id} className="flex items-center gap-2 border-[3px] border-border bg-bg-card px-3 py-2">
              <span className="w-5 text-right text-[10px] text-muted">{i + 1}</span>
              <Avatar src={m.avatar_url} size={20} dark={m.status === "invited"} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-cream normal-case">@{m.login}</span>
              {m.status === "former" && <span className="text-[8px] text-dim">ex-member</span>}
              <span className="text-[10px] text-cream tabular-nums">{fmt(m.contributions)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── Invite box ──────────────────────────────────────────────

function InviteBox({ slug }: { slug: string }) {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ login: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/leagues/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't invite.");
        return;
      }
      setResult({ login: json.login, link: json.link });
      setLogin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border-t-2 border-border pt-6">
      <h2 className="text-sm text-cream">Invite a colleague</h2>
      <p className="mt-1 text-[11px] text-muted normal-case">
        Their building shows up dark until they sign in. Send them the link in Slack or a DM.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="GitHub username"
          aria-label="GitHub username"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-xs"
        />
        <button
          type="submit"
          disabled={busy || !login.trim()}
          className="btn-press border-2 border-lime px-3 py-2 text-[10px] text-lime disabled:opacity-40"
        >
          {busy ? "..." : "Invite"}
        </button>
      </form>
      {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
      {result && (
        <div className="mt-3 border-2 border-border bg-bg-card p-3">
          <p className="text-[10px] text-muted normal-case">Link for @{result.login}</p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={result.link}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-bg-raised px-2 py-1.5 text-[11px] text-cream normal-case outline-none"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(result.link).then(() => setCopied(true), () => {});
              }}
              className="btn-press border-2 border-border px-3 text-[10px] text-cream"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Admin ───────────────────────────────────────────────────

function AdminBox({
  slug,
  mode,
  members,
  viewerLogin,
  kind,
}: {
  slug: string;
  mode: "xp" | "contributions";
  members: LeaguePageData["members"];
  viewerLogin: string;
  kind: "company" | "custom";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = members.filter(
    (m) => m.status === "active" && m.login !== viewerLogin && (kind === "custom" || m.verification),
  );

  async function patch(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't save.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border-t-2 border-border pt-6">
      <h2 className="text-sm text-cream">Admin</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-muted">Scoring</span>
        {(
          [
            ["xp", "Code + game XP"],
            ["contributions", "Code only"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={busy || mode === id}
            onClick={() => patch({ scoring_mode: id })}
            className={`btn-press border-2 px-3 py-1.5 text-[10px] ${mode === id ? "border-lime text-lime" : "border-border text-muted hover:text-cream"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {candidates.length > 0 && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("admin_login");
            if (typeof v === "string" && v) patch({ admin_login: v });
          }}
        >
          <label htmlFor="admin_login" className="text-[10px] text-muted">
            Hand admin to
          </label>
          <select
            id="admin_login"
            name="admin_login"
            className="border-2 border-border bg-bg-raised px-2 py-1.5 text-base text-cream normal-case sm:text-[11px]"
          >
            {candidates.map((m) => (
              <option key={m.developer_id} value={m.login}>
                @{m.login}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="btn-press border-2 border-border px-3 py-1.5 text-[10px] text-cream">
            Transfer
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
    </section>
  );
}
