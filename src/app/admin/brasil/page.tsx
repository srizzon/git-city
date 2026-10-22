"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ElectionDesk from "./ElectionDesk";

// The Brasil town's comments desk: the connected Instagram account and which
// of its reels count (their comments arrive by webhook, with a sync as the
// safety net); pasting comments by hand (one per line, "insta_user: the
// comment" or just the comment); the log of every comment imported and what
// came of it; taking someone off the map; and the game's desk (ElectionDesk:
// the presidential race, a dev's points, a new Instagram token).

interface CommentRow {
  id: string;
  reel: string;
  ig_user: string | null;
  github_login: string | null;
  uf: string | null;
  outcome: string;
  created_at: string;
}

interface Post {
  id: string;
  permalink: string;
  caption?: string;
  media_product_type: string;
  timestamp: string;
  thumbnail_url?: string;
  media_url?: string;
  comments_count?: number;
  /** What the reel is watched for, or null. */
  watching: "brasil" | "city" | null;
  /** What its comments brought in: imported, and new buildings. */
  stats: { comments: number; added: number };
}

interface Instagram {
  account: { username: string | null } | null;
  media: Post[];
  error?: string | null;
}

const KIND = { city: "City", brasil: "Brasil" } as const;

interface Day {
  day: number;
  date: string;
  devs: number;
  founded: number;
  arrived: { login: string; uf: string | null }[];
  newFounders: { login: string; uf: string; city: string }[];
  states: { uf: string; devs: number; today: number }[];
  line: string;
}

interface Result {
  line: string;
  outcome: string;
  login: string | null;
  uf: string | null;
}

const OUTCOME: Record<string, { label: string; tone: string }> = {
  added: { label: "On the map", tone: "text-lime" },
  already: { label: "Already there", tone: "text-cream" },
  unknown_user: { label: "Not on GitHub", tone: "text-red-400" },
  no_login: { label: "No username", tone: "text-muted" },
  blocked: { label: "Account already used", tone: "text-orange-300" },
  capped: { label: "Hourly cap", tone: "text-orange-300" },
};

/** A reel's picture, small. */
function Thumb({ post }: { post: Post }) {
  const src = post.thumbnail_url ?? post.media_url;
  return (
    <a href={post.permalink} target="_blank" rel="noreferrer" className="block h-14 w-11 shrink-0 overflow-hidden bg-bg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </a>
  );
}

export default function BrasilAdminPage() {
  const [log, setLog] = useState<{ comments: CommentRow[]; residents: number } | null>(null);
  const [reel, setReel] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [removeLogin, setRemoveLogin] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [ig, setIg] = useState<Instagram | null>(null);
  const [igNote, setIgNote] = useState<string | null>(null);
  const [igBusy, setIgBusy] = useState(false);

  const loadIg = useCallback(async () => {
    const res = await fetch("/api/admin/brasil?view=instagram", { cache: "no-store" });
    if (res.ok) setIg((await res.json()) as Instagram);
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/brasil?view=instagram", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setIg(j as Instagram))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const [showAll, setShowAll] = useState(false);
  const [day, setDay] = useState<Day | null>(null);
  const [dayDate, setDayDate] = useState("");
  const [dayCopied, setDayCopied] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/brasil?view=day${dayDate ? `&date=${dayDate}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setDay(j as Day))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [dayDate]);
  const watched = ig?.media.filter((m) => m.watching) ?? [];
  const others = ig?.media.filter((m) => !m.watching) ?? [];
  const watch = (m: Post, kind: "city" | "brasil" | null) =>
    igAction({ action: "watch", mediaId: m.id, permalink: m.permalink, caption: m.caption ?? "", watching: kind }, () =>
      kind ? `Watching as ${KIND[kind]}. New comments get a building and a reply; Sync now answers the ones already there.` : "Stopped watching that reel.",
    );

  const igAction = async (body: Record<string, unknown>, done: (json: Record<string, unknown>) => string) => {
    setIgBusy(true);
    try {
      const res = await fetch("/api/admin/brasil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as Record<string, unknown>;
      setIgNote(res.ok ? done(json) : String(json.error ?? "Failed."));
      await Promise.all([loadIg(), load()]);
    } finally {
      setIgBusy(false);
    }
  };

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/brasil", { cache: "no-store" });
    if (res.ok) setLog((await res.json()) as { comments: CommentRow[]; residents: number });
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/brasil", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setLog(j as { comments: CommentRow[]; residents: number }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const importNow = async () => {
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/brasil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", reel, comments: text }) });
      const json = (await res.json()) as { results?: Result[]; error?: string };
      if (!res.ok) setNote(json.error ?? "Import failed.");
      setResults(json.results ?? []);
      setText("");
      await load();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const res = await fetch("/api/admin/brasil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", login: removeLogin }) });
    const json = (await res.json()) as { removed?: string; error?: string };
    setNote(res.ok ? `@${json.removed} is off the map.` : (json.error ?? "Couldn't remove."));
    setRemoveLogin("");
    await load();
  };

  const lines = text.split("\n").filter((l) => l.trim()).length;
  const input = "w-full border border-border bg-bg px-3 py-2 text-[12px] text-cream outline-none placeholder:text-dim focus:border-lime/50";

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <Link href="/admin" className="text-[11px] text-muted hover:text-cream">
            ← Admin
          </Link>
          <h1 className="mt-2 text-sm text-cream">Brasil town · comments</h1>
          <p className="mt-1 text-[11px] text-muted">
            {log ? `${log.residents.toLocaleString("en-US")} on the map` : "Loading…"} ·{" "}
            <Link href="/town/brasil-town" className="text-cream-dark hover:text-lime">
              open the map
            </Link>
          </p>
        </header>

        <section className="flex flex-col gap-4 border border-border bg-bg-raised p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-wider text-dim">Instagram</h2>
            <div className="flex items-center gap-3 text-[11px]">
              <span className={ig?.account ? "text-lime" : "text-muted"}>{!ig ? "Loading…" : ig.account ? `@${ig.account.username}` : "Not connected"}</span>
              <button type="button" disabled={igBusy || !ig?.account} onClick={() => igAction({ action: "sync" }, (j) => `${j.fresh ? `${j.fresh} new comment${j.fresh === 1 ? "" : "s"} answered.` : "No new comments."} Webhooks: ${String(j.fields)}.`)} className="border border-border px-3 py-1.5 text-cream hover:border-lime hover:text-lime disabled:opacity-40">
                {igBusy ? "Working…" : "Sync now"}
              </button>
            </div>
          </div>
          {(igNote || ig?.error) && <p className="text-[11px] text-muted">{igNote ?? ig?.error}</p>}

          {/* The reels whose comments count right now. */}
          <div className="flex flex-col gap-2">
            <h3 className="text-[10px] uppercase tracking-wider text-dim">Watching</h3>
            {watched.length === 0 ? (
              <p className="text-[11px] text-muted">No reel yet. Pick one below: comments on it get a building and a reply.</p>
            ) : (
              watched.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border border-lime/40 p-2">
                  <Thumb post={m} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] normal-case text-cream">{m.caption?.split("\n")[0] || m.permalink}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      <span className="bg-lime px-1.5 py-0.5 text-bg">{KIND[m.watching!]}</span> {m.stats.comments} comment{m.stats.comments === 1 ? "" : "s"} in · {m.stats.added} new building{m.stats.added === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button type="button" disabled={igBusy} onClick={() => watch(m, null)} className="shrink-0 border border-border px-2.5 py-1 text-[10px] text-muted hover:border-red-400 hover:text-red-400 disabled:opacity-40">
                    Stop
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Every other reel, newest first. */}
          <div className="flex flex-col gap-2">
            <h3 className="text-[10px] uppercase tracking-wider text-dim">Add a reel</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {others.slice(0, showAll ? others.length : 8).map((m) => (
                <div key={m.id} className="flex flex-col border border-border">
                  <a href={m.permalink} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] overflow-hidden bg-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {(m.thumbnail_url ?? m.media_url) && <img src={m.thumbnail_url ?? m.media_url} alt="" className="h-full w-full object-cover opacity-80" />}
                    <span className="absolute left-1.5 top-1.5 bg-bg/90 px-1.5 py-0.5 text-[9px] text-cream">
                      {new Date(m.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {m.comments_count ?? 0} comments
                    </span>
                  </a>
                  <p className="truncate px-2 pt-1.5 text-[10px] normal-case text-muted">{m.caption?.split("\n")[0] || "No caption"}</p>
                  <div className="flex items-center gap-1 p-2 pt-1.5">
                    <span className="mr-auto whitespace-nowrap text-[9px] text-dim">Watch as</span>
                    {(["city", "brasil"] as const).map((k) => (
                      <button key={k} type="button" disabled={igBusy} onClick={() => watch(m, k)} className="border border-border px-2 py-1 text-[10px] text-cream hover:border-lime hover:text-lime disabled:opacity-40">
                        {KIND[k]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {others.length > 8 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-[10px] text-muted hover:text-cream">
                {showAll ? "Show fewer" : `Show ${others.length - 8} more`}
              </button>
            )}
            <p className="text-[10px] text-dim">City: a building in Git City. Brasil: a building in Git City and on the Brasil map, in the state they name.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3 border border-border bg-bg-raised p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-wider text-dim">Episode numbers</h2>
            <input type="date" value={dayDate || day?.date || ""} onChange={(e) => setDayDate(e.target.value)} className="border border-border bg-bg px-2 py-1 text-[11px] text-cream [color-scheme:dark]" />
          </div>
          {!day ? (
            <p className="text-[11px] text-muted">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-px border border-border bg-border text-center">
                {[
                  ["Day", day.day > 0 ? String(day.day) : "–"],
                  ["Devs", day.devs.toLocaleString("en-US")],
                  ["Cities", `${day.founded}`],
                  ["Today", `+${day.arrived.length}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg-raised py-2">
                    <div className="text-sm text-lime">{v}</div>
                    <div className="text-[9px] uppercase text-muted">{k}</div>
                  </div>
                ))}
              </div>
              {day.newFounders.length > 0 && (
                <p className="text-[11px] text-cream">
                  New cities: <span className="normal-case">{day.newFounders.map((f) => `${f.city} (${f.uf}) by @${f.login}`).join(", ")}</span>
                </p>
              )}
              <p className="text-[11px] text-muted">
                Top today: {day.states.filter((s) => s.today > 0).sort((a, b) => b.today - a.today).slice(0, 5).map((s) => `${s.uf} +${s.today}`).join(" · ") || "nobody yet"}
              </p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate border border-border bg-bg px-2 py-1.5 text-[10px] normal-case text-muted">{day.line}</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(day.line).then(() => setDayCopied(true))}
                  className="shrink-0 border border-border px-3 py-1.5 text-[10px] text-cream hover:border-lime hover:text-lime"
                >
                  {dayCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </>
          )}
        </section>

        <ElectionDesk input={input} />

        <section className="flex flex-col gap-3 border border-border bg-bg-raised p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-dim">Paste comments</h2>
          <input value={reel} onChange={(e) => setReel(e.target.value)} placeholder="Reel URL (optional)" className={input} id="reel" />
          <textarea
            id="comments"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"One comment per line:\ninsta_user: @github-login SP\n@another-login Bahia"}
            className={`${input} font-mono`}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">{lines ? `${lines} comment${lines === 1 ? "" : "s"}` : "Up to 150 at a time"}</span>
            <button type="button" disabled={busy || !lines} onClick={importNow} className="border border-lime bg-lime px-4 py-2 text-[11px] text-bg disabled:opacity-40">
              {busy ? "Importing…" : "Put them on the map"}
            </button>
          </div>
          {results && (
            <ul className="flex flex-col gap-1 border-t border-border pt-3">
              {results.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="min-w-0 truncate text-muted">{r.line}</span>
                  <span className={`shrink-0 ${OUTCOME[r.outcome]?.tone ?? "text-cream"}`}>
                    {[r.login && `@${r.login} ${r.uf ?? "island"}`, OUTCOME[r.outcome]?.label ?? r.outcome].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 border border-border bg-bg-raised p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-dim">Take someone off the map</h2>
          <div className="flex gap-2">
            <input id="remove" value={removeLogin} onChange={(e) => setRemoveLogin(e.target.value)} placeholder="GitHub username" className={input} />
            <button type="button" disabled={!removeLogin.trim()} onClick={remove} className="shrink-0 border border-border px-4 text-[11px] text-cream hover:border-red-400 hover:text-red-400 disabled:opacity-40">
              Remove
            </button>
          </div>
          {note && <p className="text-[11px] text-muted">{note}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] uppercase tracking-wider text-dim">Latest comments</h2>
          {!log?.comments.length ? (
            <p className="text-[11px] text-muted">No comments imported yet.</p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-left text-[11px]">
                <thead className="text-dim">
                  <tr>
                    <th className="px-3 py-2 font-normal">When</th>
                    <th className="px-3 py-2 font-normal">Instagram</th>
                    <th className="px-3 py-2 font-normal">GitHub</th>
                    <th className="px-3 py-2 font-normal">State</th>
                    <th className="px-3 py-2 font-normal">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {log.comments.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted">{new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-3 py-1.5 text-muted">{c.ig_user ?? "–"}</td>
                      <td className="px-3 py-1.5 text-cream">{c.github_login ? `@${c.github_login}` : "–"}</td>
                      <td className="px-3 py-1.5 text-cream">{c.uf ?? (c.github_login ? "island" : "–")}</td>
                      <td className={`px-3 py-1.5 ${OUTCOME[c.outcome]?.tone ?? "text-cream"}`}>{OUTCOME[c.outcome]?.label ?? c.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
