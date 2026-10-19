"use client";

import { useCallback, useEffect, useState } from "react";

// The admin's side of the Brasil game: the presidential race (add someone,
// a famous dev who said yes, or take them out), a dev's points with a way to
// take a row back, and pasting a new Instagram token (one with the messaging
// permission, so stories tagging the account score).

interface Race {
  phase: "candidacy" | "voting";
  next: { n: number; opens: number; closes: number };
  president: { login: string } | null;
  candidates: { number: number; login: string; votes: number; addedBy: "self" | "admin" }[];
  totalVotes: number;
}

interface PointRow {
  id: number;
  kind: string;
  points: number;
  ref: string;
  week_start: string;
  created_at: string;
}

const post = async (body: Record<string, unknown>) => {
  const res = await fetch("/api/admin/brasil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
};

const brt = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ElectionDesk({ input }: { input: string }) {
  const [race, setRace] = useState<Race | null>(null);
  const [login, setLogin] = useState("");
  const [uf, setUf] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState("");
  const [points, setPoints] = useState<{ login: string; rows: PointRow[] } | null>(null);
  const [token, setToken] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/brasil?view=election", { cache: "no-store" });
    if (res.ok) setRace((await res.json()) as Race);
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/brasil?view=election", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setRace(j as Race))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const { ok, json } = await post(body);
      setNote(ok ? done : String(json.error ?? "Failed."));
      if (ok && json.candidates) setRace(json as unknown as Race);
    } finally {
      setBusy(false);
    }
  };

  const lookup = async () => {
    const res = await fetch(`/api/admin/brasil?view=points&login=${encodeURIComponent(who)}`, { cache: "no-store" });
    const json = (await res.json()) as { login?: string; rows?: PointRow[]; error?: string };
    if (!res.ok) setNote(json.error ?? "Not found.");
    else setPoints({ login: json.login!, rows: json.rows ?? [] });
  };

  return (
    <>
      <section className="flex flex-col gap-3 border border-border bg-bg-raised p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-wider text-dim">President</h2>
          <button type="button" onClick={load} className="text-[11px] text-muted hover:text-cream">
            Refresh
          </button>
        </div>
        {race && (
          <p className="text-[11px] text-muted">
            {race.president ? <>In office: <span className="text-cream">@{race.president.login}</span> · </> : "Nobody in office · "}
            Term {race.next.n}: vote {brt(race.next.opens)} → {brt(race.next.closes)} (Brasília){race.phase === "voting" ? ` · open now, ${race.totalVotes} votes` : ""}
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {race?.candidates.map((c) => (
            <li key={c.login} className="flex items-center justify-between gap-3 border border-border px-3 py-1.5 text-[11px]">
              <span className="text-cream">
                <span className="text-lime">{c.number}</span> @{c.login} <span className="text-dim">{c.addedBy === "admin" ? "· added by admin" : ""}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted">{c.votes} votes</span>
                <button type="button" disabled={busy} onClick={() => run({ action: "uncandidate", login: c.login }, `@${c.login} is out of the race.`)} className="text-muted hover:text-red-400 disabled:opacity-40">
                  Remove
                </button>
              </span>
            </li>
          ))}
          {race && race.candidates.length === 0 && <li className="text-[11px] text-dim">Nobody running yet.</li>}
        </ul>
        <p className="text-[11px] text-dim">Add someone only after they said yes. Not on the map yet: they go in the state you type (blank: the island).</p>
        <div className="flex gap-2">
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="github username" className={input} />
          <input value={uf} onChange={(e) => setUf(e.target.value)} placeholder="UF" className={`${input} w-20`} />
          <button
            type="button"
            disabled={busy || !login.trim()}
            onClick={() => run({ action: "candidate", login, uf }, `@${login.trim().replace(/^@/, "")} is running.`).then(() => setLogin(""))}
            className="shrink-0 border border-lime px-3 text-[11px] text-lime disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3 border border-border bg-bg-raised p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-dim">Points</h2>
        <div className="flex gap-2">
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="github username" className={input} />
          <button type="button" disabled={!who.trim()} onClick={lookup} className="shrink-0 border border-border px-3 text-[11px] text-cream disabled:opacity-40">
            Look up
          </button>
        </div>
        {points && (
          <ul className="flex flex-col gap-1">
            {points.rows.length === 0 && <li className="text-[11px] text-dim">@{points.login} has no points stored (coding points aren&apos;t stored).</li>}
            {points.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border border-border px-3 py-1 text-[11px]">
                <span className="text-cream">
                  +{r.points} {r.kind} <span className="text-dim">· week {r.week_start} · {r.ref}</span>
                </span>
                <button
                  type="button"
                  onClick={() => post({ action: "unscore", id: r.id }).then(lookup)}
                  className="text-muted hover:text-red-400"
                >
                  Take back
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border border-border bg-bg-raised p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-dim">Instagram token</h2>
        <p className="text-[11px] text-dim">
          For stories to score: in Meta&apos;s dashboard, give the app instagram_business_manage_messages, generate a new token for the account and paste it here. It&apos;s checked before it replaces the current one.
        </p>
        <div className="flex gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="IGAA…" type="password" autoComplete="off" className={input} />
          <button
            type="button"
            disabled={busy || token.trim().length < 20}
            onClick={() =>
              post({ action: "token", token }).then(({ ok, json }) => {
                setNote(ok ? `Connected as @${String(json.username)}, webhooks: ${String(json.fields)}.` : String(json.error ?? "Failed."));
                if (ok) setToken("");
              })
            }
            className="shrink-0 border border-lime px-3 text-[11px] text-lime disabled:opacity-40"
          >
            Use it
          </button>
        </div>
      </section>
      {note && <p className="text-[11px] text-lime">{note}</p>}
    </>
  );
}
