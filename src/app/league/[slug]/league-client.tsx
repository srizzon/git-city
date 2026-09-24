"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import PixelSpinner, { Pending } from "@/components/leagues/PixelSpinner";
import { generateCityLayout, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import { usePerfMode } from "@/lib/perfMode";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import type { LeaguePageData } from "@/lib/leagues/queries";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-3 text-[10px] text-muted">
      <PixelSpinner />
      Building the skyline
    </div>
  ),
});

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

function Avatar({ src, size = 28, faded = false }: { src: string | null; size?: number; faded?: boolean }) {
  if (!src) return <div className="shrink-0 bg-bg-raised" style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      style={{ width: size, height: size, imageRendering: "pixelated", opacity: faded ? 0.45 : undefined }}
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
  const invited = members.filter((m) => m.status === "invited");

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
            {fmt(counts.total)} buildings · {fmt(counts.joined)} joined · {fmt(counts.invited)} invited
          </p>
        </header>

        {showJoinCta && (
          <JoinCta
            leagueSlug={league.slug}
            leagueKind={league.kind}
            signedIn={!!viewer}
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

        {isMember && <InviteBox slug={league.slug} />}

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
                <li className="text-[11px] text-muted normal-case">Nobody has joined yet.</li>
              )}
            </ol>

            {invited.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[10px] text-muted">Invited · not joined yet</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {invited.map((m) => (
                    <li key={m.developer_id} className="flex items-center gap-1.5 border-2 border-border px-2 py-1">
                      <Avatar src={m.avatar_url} size={16} faded />
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
  invitee,
  refLogin,
}: {
  leagueSlug: string;
  leagueKind: "company" | "custom";
  signedIn: boolean;
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
        setBusy(false);
        return;
      }
      // Keep the pending state until the reload replaces the page.
      window.location.reload();
    } catch {
      setError("Couldn't join. Try again.");
      setBusy(false);
    }
  }

  const needsVerify = signedIn && leagueKind === "company";
  return (
    <section className="mt-6 border-[3px] border-lime bg-bg-card p-4">
      <p className="text-sm text-cream">Your team is waiting.</p>
      <p className="mt-1 text-[11px] text-muted normal-case">
        {invitee ? `@${invitee}'s building is on the skyline, waiting for you. ` : ""}Join to start scoring in the weekly race.
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
          {busy ? (
            <Pending label={signedIn ? "Joining" : "Opening GitHub"} />
          ) : signedIn ? (
            "Join the league"
          ) : (
            "Join the league"
          )}
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
              <Avatar src={m.avatar_url} size={20} faded={m.status === "invited"} />
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

type InviteState =
  | { kind: "idle" }
  | { kind: "sending"; login: string }
  | { kind: "done"; login: string; avatar: string | null; link: string; created: boolean }
  | { kind: "error"; message: string };

function InviteBox({ slug }: { slug: string }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [state, setState] = useState<InviteState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const sending = state.kind === "sending";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = login.trim().replace(/^@/, "");
    if (!target || sending) return;
    setCopied(false);
    setState({ kind: "sending", login: target });
    try {
      const res = await fetch(`/api/leagues/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? "Couldn't invite." });
        return;
      }
      setState({
        kind: "done",
        login: json.login,
        avatar: `https://github.com/${json.login}.png?size=64`,
        link: json.link,
        created: !!json.created_building,
      });
      setLogin("");
      // Re-fetch the page so the new invited building shows in the city + list.
      startRefresh(() => router.refresh());
    } catch {
      setState({ kind: "error", message: "Network error. Try again." });
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mt-4 border-[3px] border-border bg-bg-card p-4">
      <h2 className="text-sm text-cream">Invite a colleague</h2>
      <p className="mt-1 text-[11px] text-muted normal-case">
        Their building joins the skyline faded until they sign in.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="GitHub username"
          aria-label="GitHub username"
          autoCapitalize="off"
          spellCheck={false}
          disabled={sending}
          className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime disabled:opacity-60 sm:text-xs"
        />
        <button
          type="submit"
          disabled={sending || !login.trim()}
          className="btn-press min-w-[92px] border-2 border-lime px-3 py-2 text-[10px] text-lime disabled:opacity-40"
        >
          {sending ? <Pending label="Inviting" /> : "Invite"}
        </button>
      </form>

      <div aria-live="polite">
        {state.kind === "sending" && (
          <p className="mt-3 flex items-center gap-2 text-[10px] text-muted normal-case">
            <PixelSpinner size={5} />
            Loading @{state.login} from GitHub and raising their building. This takes a few seconds.
          </p>
        )}

        {state.kind === "error" && <p className="mt-3 text-[11px] text-red-400 normal-case">{state.message}</p>}

        {state.kind === "done" && (
          <div className="mt-3 border-2 border-lime/60 bg-bg-raised p-3">
            <div className="flex items-center gap-3">
              <Avatar src={state.avatar} size={32} faded />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-cream normal-case">@{state.login} is on the skyline</p>
                <p className="flex items-center gap-2 text-[10px] text-muted normal-case">
                  {refreshing ? (
                    <>
                      <PixelSpinner size={4} /> Adding their building to the city
                    </>
                  ) : (
                    "Faded until they sign in. Send them this link."
                  )}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={state.link}
                aria-label="Invite link"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-bg px-2 py-2 text-[11px] text-cream normal-case outline-none"
              />
              <button
                type="button"
                onClick={() => copy(state.link)}
                className={`btn-press min-w-[80px] px-3 text-[10px] ${copied ? "bg-lime text-bg" : "border-2 border-lime text-lime"}`}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}
      </div>
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
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = saving !== null || refreshing;
  const candidates = members.filter(
    (m) => m.status === "active" && m.login !== viewerLogin && (kind === "custom" || m.verification),
  );

  async function patch(body: Record<string, string>) {
    setSaving(Object.values(body)[0] ?? "saving");
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
      startRefresh(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(null);
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
            {saving === id ? <Pending label="Saving" /> : label}
          </button>
        ))}
        {refreshing && saving === null && <PixelSpinner size={4} />}
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
          <button type="submit" disabled={busy} className="btn-press min-w-[96px] border-2 border-border px-3 py-1.5 text-[10px] text-cream disabled:opacity-50">
            {saving && saving !== "xp" && saving !== "contributions" ? <Pending label="Moving" /> : "Transfer"}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
    </section>
  );
}
