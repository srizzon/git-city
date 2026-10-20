"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdminProject, AdSlotRow, ProjectHealth } from "@/lib/towns/brasil-projects-server";

// The Brasil projects desk. Queue: everything waiting for a person (in review,
// hidden, reported), each with what every check found, the page as it was
// read, and approve / reject / hide / ban (A, R, J for next). Projects: search
// everything. Ads: book the slot by hand (requests come by email). Health: the
// moderation and vote numbers.

type Tab = "queue" | "all" | "ads" | "health";

const TONE: Record<string, string> = { approve: "text-lime", review: "text-[#f0b429]", reject: "text-red-400" };
const STATUS_TONE: Record<string, string> = { live: "text-lime", review: "text-[#f0b429]", rejected: "text-red-400", hidden: "text-red-400", checking: "text-muted", removed: "text-muted" };
const REJECT_REASONS = ["Betting or casino", "Scam or get-rich scheme", "Not a software project", "Not their project", "Adult content", "Broken link"];

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

async function post(body: unknown): Promise<string | null> {
  const r = await fetch("/api/admin/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return null;
  return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Failed (${r.status})`;
}

function ProjectItem({ p, active, onDone }: { p: AdminProject; active: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      const err = await post(body);
      setBusy(false);
      setNote(err);
      if (!err) onDone();
    },
    [onDone],
  );
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a") void act({ action: "approve", id: p.id });
      if (e.key === "r") setRejecting(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, act, p.id]);
  const page = p.checks.find((c) => c.kind === "fetch" && c.raw && "title" in c.raw)?.raw as { title?: string; description?: string; image?: string; text?: string; finalUrl?: string } | undefined;
  const age = p.checks.find((c) => c.kind === "reputation" && c.raw && "domainAgeDays" in c.raw)?.raw?.domainAgeDays;
  return (
    <article className={`flex flex-col gap-3 border-2 p-4 ${active ? "border-lime" : "border-border"} bg-bg-raised`}>
      <header className="flex flex-wrap items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.icon && <img src={p.icon} alt="" width={32} height={32} className="h-8 w-8 bg-bg" referrerPolicy="no-referrer" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-cream">
            {p.name} <span className={`text-xs ${STATUS_TONE[p.status]}`}>· {p.status}</span>
            {p.appealed && <span className="text-xs text-[#f0b429]"> · appealed</span>}
          </p>
          <p className="text-xs text-warm">{p.tagline}</p>
          <p className="mt-1 text-xs text-muted">
            <a href={p.url} target="_blank" rel="noreferrer nofollow" className="underline">
              {p.url}
            </a>
            {p.repo && (
              <>
                {" · "}
                <a href={p.repo} target="_blank" rel="noreferrer" className="underline">
                  repo
                </a>
              </>
            )}
            {" · "}
            <a href={`https://github.com/${p.maker.login}`} target="_blank" rel="noreferrer" className="underline">
              @{p.maker.login}
            </a>
            {p.uf ? ` · ${p.uf}` : ""} · {p.category} · {when(p.createdAt)} · {p.votes} votes ({p.votesTotal} total) · {p.visits} visits
            {age !== undefined && age !== null ? ` · domain ${String(age)}d old` : ""}
            {p.banned && <span className="text-red-400"> · maker banned</span>}
          </p>
        </div>
      </header>
      {p.reason && <p className="border-l-2 border-[#f0b429] pl-3 text-xs text-cream">{p.reason}</p>}
      {p.description && <p className="whitespace-pre-line text-xs text-muted">{p.description}</p>}
      {page && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer text-cream">The page as read{page.finalUrl && page.finalUrl !== p.url ? ` (landed on ${page.finalUrl})` : ""}</summary>
          <div className="mt-2 flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {page.image && <img src={page.image} alt="" className="h-24 w-44 shrink-0 bg-bg object-cover" referrerPolicy="no-referrer" />}
            <div className="min-w-0">
              <p className="text-cream">{page.title}</p>
              <p>{page.description}</p>
              <p className="mt-1 line-clamp-6">{page.text}</p>
            </div>
          </div>
        </details>
      )}
      <ul className="flex flex-col gap-1 text-xs">
        {p.checks.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-20 shrink-0 text-muted">{c.kind}</span>
            <span className={`w-14 shrink-0 ${TONE[c.verdict] ?? ""}`}>{c.verdict}</span>
            <span className="min-w-0 text-cream">
              {c.category && c.category !== "ok" ? `[${c.category}] ` : ""}
              {c.reason ?? ""}
              {c.model ? <span className="text-muted"> · {c.model}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {p.reports.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
          {p.reports.map((r, i) => (
            <li key={i} className="text-red-300">
              Report: {r.reason}
              {r.note ? ` · ${r.note}` : ""} · {r.counted ? "counted" : "new account"} · {when(r.at)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {p.status !== "live" && (
          <button type="button" disabled={busy} onClick={() => act({ action: "approve", id: p.id })} className="bg-lime px-3 py-1.5 text-bg disabled:opacity-50">
            Approve (A)
          </button>
        )}
        {p.status !== "rejected" && (
          <button type="button" disabled={busy} onClick={() => setRejecting((r) => !r)} className="border border-red-400 px-3 py-1.5 text-red-400">
            Reject (R)
          </button>
        )}
        {p.status === "live" && (
          <button type="button" disabled={busy} onClick={() => act({ action: "hide", id: p.id, reason: "Hidden by the admin" })} className="border border-border px-3 py-1.5 text-cream">
            Hide
          </button>
        )}
        {p.reports.length > 0 && (
          <button type="button" disabled={busy} onClick={() => act({ action: "dismiss_reports", id: p.id })} className="border border-border px-3 py-1.5 text-cream">
            Dismiss reports
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => act({ action: "recheck", id: p.id })} className="border border-border px-3 py-1.5 text-cream">
          Re-check
        </button>
        <button type="button" disabled={busy} onClick={() => act({ action: p.banned ? "unban" : "ban", developerId: p.maker_id, reason: "Posted abuse" })} className="border border-border px-3 py-1.5 text-muted">
          {p.banned ? "Unban maker" : "Ban maker"}
        </button>
      </div>
      {rejecting && (
        <div className="flex flex-wrap gap-2 text-xs">
          {REJECT_REASONS.map((r) => (
            <button key={r} type="button" disabled={busy} onClick={() => act({ action: "reject", id: p.id, reason: r })} className="border border-red-400/60 px-2.5 py-1 text-red-300">
              {r}
            </button>
          ))}
        </div>
      )}
      {note && <p className="text-xs text-red-400">{note}</p>}
    </article>
  );
}

function Projects({ view }: { view: "queue" | "all" }) {
  const [rows, setRows] = useState<AdminProject[] | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        fetch(`/api/admin/projects?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((j: { projects: AdminProject[] }) => live && setRows(j.projects ?? [])),
      q ? 300 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [view, q, tick]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "j") setActive((a) => Math.min(a + 1, (rows?.length ?? 1) - 1));
      if (e.key === "k") setActive((a) => Math.max(a - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return (
    <div className="flex flex-col gap-4">
      {view === "all" && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or link" className="border-2 border-border bg-bg px-3 py-2 text-sm text-cream" />}
      {view === "queue" && <p className="text-xs text-muted">Keys: A approve · R reject · J/K next/previous.</p>}
      {!rows ? <p className="text-xs text-muted">Loading</p> : rows.length === 0 ? <p className="text-sm text-muted">{view === "queue" ? "Nothing waiting." : "No projects."}</p> : null}
      {rows?.map((p, i) => (
        <div key={p.id} onClick={() => setActive(i)}>
          <ProjectItem p={p} active={view === "queue" && i === active} onDone={refresh} />
        </div>
      ))}
    </div>
  );
}

const blankSlot = (): Partial<AdSlotRow> => {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + ((8 - next.getUTCDay()) % 7 || 7));
  next.setUTCHours(0, 0, 0, 0);
  const end = new Date(next.getTime() + 7 * 86_400_000);
  return { name: "", tagline: "", url: "", status: "draft", starts_at: next.toISOString().slice(0, 16), ends_at: end.toISOString().slice(0, 16), contact_email: "", price_note: "", notes: "" };
};

function Ads() {
  const [slots, setSlots] = useState<AdSlotRow[] | null>(null);
  const [edit, setEdit] = useState<Partial<AdSlotRow> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    fetch("/api/admin/projects?view=ads", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { slots: AdSlotRow[] }) => setSlots(j.slots ?? []));
  }, [tick]);
  const save = async () => {
    if (!edit) return;
    const slot = { ...edit, starts_at: new Date(`${edit.starts_at}Z`).toISOString(), ends_at: new Date(`${edit.ends_at}Z`).toISOString() };
    const r = await fetch("/api/admin/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_ad", slot }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; flags?: string[] };
    if (!r.ok) setNote(j.error ?? "Failed");
    else {
      setNote(j.flags?.length ? `Saved. The checks flagged: ${j.flags.join("; ")}` : "Saved.");
      setEdit(null);
      setTick((t) => t + 1);
    }
  };
  const field = (k: keyof AdSlotRow, label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input type={type} value={String(edit?.[k] ?? "")} onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))} className="border-2 border-border bg-bg px-2 py-1.5 text-sm text-cream" />
    </label>
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">Requests arrive by email. Book one here: it shows in the AD row while it&apos;s live and its dates hold (times in UTC; a week runs Monday 00:00 to Monday 00:00).</p>
      {edit ? (
        <div className="flex flex-col gap-3 border-2 border-border bg-bg-raised p-4">
          {field("name", "Name (40)")}
          {field("tagline", "Tagline (80)")}
          {field("url", "Link")}
          {field("icon_url", "Icon URL (optional; else the site's)")}
          <div className="grid grid-cols-2 gap-3">
            {field("starts_at", "Starts (UTC)", "datetime-local")}
            {field("ends_at", "Ends (UTC)", "datetime-local")}
          </div>
          {field("contact_email", "Contact email")}
          {field("price_note", "Price agreed")}
          {field("notes", "Notes")}
          <label className="flex flex-col gap-1 text-xs text-muted">
            Status
            <select value={edit.status} onChange={(e) => setEdit((s) => ({ ...s, status: e.target.value as AdSlotRow["status"] }))} className="border-2 border-border bg-bg px-2 py-1.5 text-sm text-cream">
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="ended">Ended</option>
            </select>
          </label>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={save} className="bg-lime px-3 py-1.5 text-bg">
              Save
            </button>
            <button type="button" onClick={() => setEdit(null)} className="border border-border px-3 py-1.5 text-cream">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEdit(blankSlot())} className="self-start bg-lime px-3 py-1.5 text-xs text-bg">
          Book an ad
        </button>
      )}
      {note && <p className="text-xs text-cream">{note}</p>}
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1">Ad</th>
            <th>When (UTC)</th>
            <th>Status</th>
            <th className="text-right">Clicks</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {slots?.map((s) => (
            <tr key={s.id} className="border-t border-border text-cream">
              <td className="py-2">
                {s.name}
                <span className="block text-muted">{s.price_note}</span>
              </td>
              <td>
                {s.starts_at.slice(0, 10)} → {s.ends_at.slice(0, 10)}
              </td>
              <td>{s.status}</td>
              <td className="text-right tabular-nums">{s.clicks}</td>
              <td className="text-right">
                <button type="button" onClick={() => setEdit({ ...s, starts_at: s.starts_at.slice(0, 16), ends_at: s.ends_at.slice(0, 16) })} className="underline">
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">Views and CTR live in PostHog (sponsor_viewed, sponsor_clicked by slot_id); the demand test reads ad_offer_viewed → ad_offer_clicked → ad_form_submitted.</p>
    </div>
  );
}

function Health() {
  const [h, setH] = useState<ProjectHealth | null>(null);
  useEffect(() => {
    fetch("/api/admin/projects?view=health", { cache: "no-store" })
      .then((r) => r.json())
      .then(setH);
  }, []);
  if (!h) return <p className="text-xs text-muted">Loading</p>;
  const tiles = [
    { label: "Posted (30d)", value: h.submissions.reduce((n, d) => n + d.count, 0) },
    { label: "Live right away", value: h.autoLivePct === null ? "–" : `${h.autoLivePct}%` },
    { label: "Oldest in queue", value: h.queueOldestHours === null ? "–" : `${h.queueOldestHours}h` },
    { label: "Model cost (month)", value: `US$${h.modelCostMonth.toFixed(4)}` },
    { label: "Counted votes", value: h.votes.counted },
    { label: "Uncounted votes", value: h.votes.uncounted },
  ];
  return (
    <div className="flex flex-col gap-6 text-xs">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="border-2 border-border bg-bg-raised p-3">
            <p className="text-lg tabular-nums text-cream">{t.value}</p>
            <p className="text-muted">{t.label}</p>
          </div>
        ))}
      </div>
      <section>
        <h3 className="mb-2 text-cream">By status (30d)</h3>
        <p className="text-muted">{Object.entries(h.byStatus).map(([k, v]) => `${k} ${v}`).join(" · ") || "None"}</p>
      </section>
      <section>
        <h3 className="mb-2 text-cream">Rejected for</h3>
        <p className="text-muted">{h.rejectReasons.map((r) => `${r.category} ${r.count}`).join(" · ") || "Nothing yet"}</p>
      </section>
      <section>
        <h3 className="mb-2 text-cream">You overturned the checks</h3>
        <p className="text-muted">
          Approved after a reject: {h.overturned.approvedAfterReject} · Rejected after a pass: {h.overturned.rejectedAfterApprove}
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-cream">Vote bursts (10+ votes from new accounts in 10 min)</h3>
        <p className="text-muted">{h.bursts.map((b) => `${b.name} (${b.votes})`).join(" · ") || "None"}</p>
      </section>
      <section>
        <h3 className="mb-2 text-cream">Posted per day</h3>
        <p className="tabular-nums text-muted">{h.submissions.map((d) => `${d.day.slice(5)}: ${d.count}`).join(" · ") || "None"}</p>
      </section>
    </div>
  );
}

export default function ProjectsAdminPage() {
  const [tab, setTab] = useState<Tab>("queue");
  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-pixel text-xl uppercase text-cream">Brasil projects</h1>
          <Link href="/admin" className="text-xs text-muted hover:text-cream">
            Admin
          </Link>
        </div>
        <nav className="flex gap-2 text-xs">
          {(["queue", "all", "ads", "health"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`border-2 px-3 py-1.5 uppercase ${tab === t ? "border-lime bg-lime text-bg" : "border-border text-cream"}`}>
              {t === "all" ? "Projects" : t}
            </button>
          ))}
        </nav>
        {tab === "queue" && <Projects key="queue" view="queue" />}
        {tab === "all" && <Projects key="all" view="all" />}
        {tab === "ads" && <Ads />}
        {tab === "health" && <Health />}
      </div>
    </div>
  );
}
