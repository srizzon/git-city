"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReelState, ReelStatus } from "@/lib/reel/status";

// The review studio's live pieces: state labels, the buttons that move a
// reel along (they queue jobs for `npm run reel worker`), the script editor
// and the notes. The page refreshes itself while a job is queued.

export const STATE_LABEL: Record<ReelState, string> = {
  script: "Script to approve",
  script_ok: "Script approved",
  draft: "Draft to review",
  draft_ok: "Draft approved",
  final: "Ready to schedule",
  scheduled: "Scheduled",
  posted: "Posted",
};

export function StateTag({ status }: { status: ReelStatus }) {
  const tone = status.error ? "text-red-400" : status.queued ? "text-cream" : status.state === "posted" ? "text-muted" : "text-lime";
  const label = status.error ? `${status.error.job} failed` : status.queued ? `${status.queued === "draft" ? "Rendering the draft" : "Rendering the final"}…` : STATE_LABEL[status.state];
  return <span className={`text-[10px] uppercase tracking-wider ${tone}`}>{label}</span>;
}

/** Refreshes the page every few seconds while a job is queued, so its result shows up. */
export function RefreshWhileQueued({ queued }: { queued: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!queued) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [queued, router]);
  return null;
}

function usePost(id: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reels/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setError(j.error ?? `Failed (${res.status}).`);
    else router.refresh();
    return res.ok;
  };
  return { post, busy, error };
}

const button = "border border-border px-3 py-1.5 text-[11px] text-cream hover:border-lime hover:text-lime disabled:opacity-40";
const primary = "border border-lime bg-lime px-4 py-1.5 text-[11px] text-bg disabled:opacity-40";

export function ReelButtons({ id, status, hasFailures }: { id: string; status: ReelStatus; hasFailures: boolean }) {
  const { post, busy, error } = usePost(id);
  const s = status.state;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {s === "script" && (
          <button type="button" disabled={busy || !!status.queued} onClick={() => post({ action: "approve_script" })} className={primary}>
            Approve script
          </button>
        )}
        {s === "draft" && (
          <button type="button" disabled={busy || !!status.queued || hasFailures} onClick={() => post({ action: "approve_draft" })} className={primary}>
            Approve draft
          </button>
        )}
        {s === "final" && (
          <button type="button" disabled className={primary} title="Scheduling comes with the Instagram agenda">
            Schedule
          </button>
        )}
        {status.queued && (
          <button type="button" disabled={busy} onClick={() => post({ action: "cancel" })} className={button}>
            Cancel
          </button>
        )}
      </div>
      {hasFailures && s === "draft" && <p className="text-[11px] text-red-400">A check fails: fix the spec and render again before approving.</p>}
      {status.error && <p className="text-[11px] normal-case text-red-400">{status.error.message}</p>}
      {status.queued && <p className="text-[11px] text-muted">Queued. `npm run reel worker` renders it.</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

export function ScriptEditor({ id, lines, editable }: { id: string; lines: { show: string; say: string }[]; editable: boolean }) {
  const { post, busy, error } = usePost(id);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(lines);
  const input = "w-full border border-border bg-bg px-2 py-1 text-[11px] normal-case text-cream outline-none focus:border-lime";
  if (!editable) return null;
  if (!open)
    return (
      <button type="button" onClick={() => (setDraft(lines), setOpen(true))} className={`${button} self-start`}>
        Edit lines
      </button>
    );
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[10px] text-dim">What shows (*lime*) · what the voice says (numbers spelled out). Saving sends the reel back to script.</p>
      {draft.map((l, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <input aria-label={`Line ${i + 1} shown`} value={l.show} onChange={(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, show: e.target.value } : x)))} className={input} />
          <input aria-label={`Line ${i + 1} said`} value={l.say} onChange={(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, say: e.target.value } : x)))} className={input} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={async () => (await post({ action: "edit", lines: draft })) && setOpen(false)} className={primary}>
          Save lines
        </button>
        <button type="button" onClick={() => setOpen(false)} className={button}>
          Cancel
        </button>
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}

export function NoteBox({ id }: { id: string }) {
  const { post, busy, error } = usePost(id);
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Ask for a change"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Ask for a change (Claude reads these)"
        className="w-full border border-border bg-bg px-2 py-1.5 text-[11px] normal-case text-cream outline-none focus:border-lime"
      />
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !text.trim()} onClick={async () => (await post({ action: "note", text })) && setText("")} className={`${button} self-start`}>
          Add note
        </button>
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}
