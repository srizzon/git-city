"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import posthog from "posthog-js";
import { CATEGORIES, LIMITS, launchWeekFor, opensText, projectWeek, type Category } from "@/lib/towns/brasil-projects";
import type { Blocked, MyProject } from "@/lib/towns/brasil-projects-server";
import { Share, statusOf, type ProjectView } from "./ProjectSheet";
import { Overlay, api, postJson } from "./projects-ui";

// Sharing a project (or editing one): the link first, and the form comes back
// filled from the page and the repo (name, tagline, description), so the maker
// only fixes what's wrong. Submitting screens it on the spot (a few seconds):
// live, then the share screen to bring votes; in review, said plainly; or
// rejected, with the reason and the form to try again. Signed out: sign in.
// Not on the map: put your building first.

interface Prefill {
  url: string;
  name: string;
  tagline: string;
  description: string;
  repo: string | null;
  readable: boolean;
  note: string | null;
}


interface Form {
  url: string;
  name: string;
  tagline: string;
  description: string;
  repo: string;
  category: Category | null;
}

const empty: Form = { url: "", name: "", tagline: "", description: "", repo: "", category: null };

const input = "w-full border-2 border-border bg-bg px-3 py-2 font-sans text-[13px] normal-case text-cream outline-none placeholder:text-dim focus:border-lime/70";

function Field({ label, count, max, children }: { label: string; count?: number; max?: number; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[9px] text-muted">
        {label}
        {max !== undefined && <span className={`tabular-nums ${count! > max ? "text-red-400" : ""}`}>{count}/{max}</span>}
      </span>
      {children}
    </label>
  );
}

export default function ShareProjectSheet({
  slug,
  signedIn,
  editing,
  onSignIn,
  onPutOnMap,
  onOpenProject,
  onClose,
  onDone,
  blocked: known,
}: {
  slug: string;
  signedIn: boolean;
  /** Editing an existing project instead of posting one. */
  editing?: ProjectView | MyProject | null;
  onSignIn: () => void;
  onPutOnMap: () => void;
  /** Open one of their projects (the one that used the week). */
  onOpenProject: (slug: string) => void;
  onClose: () => void;
  /** Something was posted or changed: the card reads again. */
  onDone: () => void;
  /** Whether they can post, when the map already knows it (the card read it): null can, undefined unknown. */
  blocked?: Blocked | null;
}) {
  // Known (from the map's card): the right screen at once. Unknown: read it before showing anything but the frame.
  const [blocked, setBlocked] = useState<Blocked | null | undefined>(editing ? null : known);
  const [step, setStep] = useState<"link" | "form" | "sending" | "result">(editing ? "form" : "link");
  const [form, setForm] = useState<Form>(editing ? { url: editing.url, name: editing.name, tagline: editing.tagline, description: editing.description, repo: editing.repo ?? "", category: editing.category } : empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<MyProject | null>(null);

  useEffect(() => {
    if (editing || !signedIn || known !== undefined) return;
    fetch(`${api(slug)}?view=mine`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { blocked: Blocked | null }) => setBlocked(j.blocked))
      .catch(() => setBlocked(null));
  }, [slug, signedIn, editing, known]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const prefill = async () => {
    setBusy(true);
    setError(null);
    const r = await postJson<Prefill>(`${api(slug)}/prefill`, { url: form.url });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const p = r.data;
    setForm((f) => ({ ...f, url: p.url, name: f.name || p.name, tagline: f.tagline || p.tagline, description: f.description || p.description, repo: f.repo || (p.repo ?? "") }));
    setNote(!p.readable ? `We couldn't read the page${p.note ? ` (${p.note})` : ""}. Fill it in yourself; it'll be checked when you post.` : !p.name || !p.tagline ? "The page didn't say much. Fill in what's missing." : null);
    posthog.capture("project_prefilled", { readable: p.readable, has_repo: !!p.repo });
    setStep("form");
  };

  const submit = async () => {
    if (!form.category) {
      setError("Pick a category.");
      return;
    }
    setError(null);
    setStep("sending");
    const body = { ...form, repo: form.repo.trim() || null };
    const r = editing ? await postJson<{ project: MyProject }>(`${api(slug)}/${editing.id}`, body, "PATCH") : await postJson<{ project: MyProject }>(api(slug), body);
    if (!r.ok) {
      setStep("form");
      setError(r.error);
      return;
    }
    posthog.capture(editing ? "project_edited" : "project_submitted", { category: form.category, has_repo: !!body.repo, outcome: r.data.project.status });
    setResult(r.data.project);
    setStep("result");
    onDone();
  };

  const title = editing ? "Edit project" : "Share your project";
  const [now] = useState(() => Date.now());
  const lateWeek = launchWeekFor(new Date(now)) !== projectWeek(new Date(now));

  if (!signedIn)
    return (
      <Overlay title={title} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <p className="text-[11px] normal-case leading-relaxed text-warm">Post what you built. Devs upvote it, and the week&apos;s top 3 show on the map and win points.</p>
          <button type="button" onClick={onSignIn} className="btn-press min-h-10 bg-lime text-[10px] text-bg">
            Sign in with GitHub
          </button>
        </div>
      </Overlay>
    );

  // Rare: opened from somewhere that didn't know yet. The frame only, for the moment it takes.
  if (blocked === undefined) return <Overlay title={title} onClose={onClose}>{null}</Overlay>;

  if (blocked) {
    const btn = "btn-press flex min-h-10 flex-1 items-center justify-center border-2 text-[10px]";
    return (
      <Overlay title={title} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="text-[12px] normal-case leading-relaxed text-cream">
            {blocked.project?.status === "removed" ? "You deleted this week's project. A deleted one still uses the week." : blocked.error}
          </p>
          {blocked.project && (
            <div className="flex items-center justify-between gap-3 border-2 border-border bg-bg-raised px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[11px] normal-case text-cream">{blocked.project.name}</span>
                <span className={`text-[9px] ${statusOf(blocked.project.status).tone}`}>{statusOf(blocked.project.status).label}</span>
              </span>
              {blocked.project.status !== "removed" && (
                <button type="button" onClick={() => onOpenProject(blocked.project!.slug)} className="btn-press shrink-0 border-2 border-lime px-3 py-1.5 text-[9px] text-lime hover:bg-lime hover:text-bg">
                  Open it
                </button>
              )}
            </div>
          )}
          {blocked.opens && (
            <p className="text-[10px] text-muted">
              Next one from <span className="text-cream">{opensText(blocked.opens)}</span>
            </p>
          )}
          {blocked.code === "not_on_map" && (
            <button type="button" onClick={onPutOnMap} className={`${btn} border-lime bg-lime text-bg`}>
              Put my building
            </button>
          )}
          {blocked.code === "week_limit" && blocked.project?.status !== "removed" && <p className="text-[9px] normal-case text-dim">One project a week. Editing it is free; deleting it doesn&apos;t give the week back.</p>}
        </div>
      </Overlay>
    );
  }

  if (step === "result" && result) {
    const st = statusOf(result.status);
    return (
      <Overlay title={title} onClose={onClose}>
        <div className="flex flex-col gap-4">
          {result.status === "live" ? (
            <>
              <p className="flex items-center gap-2 text-[12px] text-lime">
                <Check size={16} strokeWidth={3} aria-hidden /> {editing ? "Saved" : "It's live"}
              </p>
              <p className="text-[11px] normal-case leading-relaxed text-warm">{editing ? `${result.name} is up to date.` : `${result.name} competes ${result.week && result.week !== projectWeek(new Date(now)) ? "next week, from Sunday 21h" : "this week, until Sunday 21h"}. The top 3 win points. Bring votes:`}</p>
              <Share slug={slug} p={result} />
            </>
          ) : result.status === "review" ? (
            <>
              <p className={`text-[12px] ${st.tone}`}>In review</p>
              <p className="text-[11px] normal-case leading-relaxed text-warm">A person looks at it before it goes up. You get an email either way.</p>
            </>
          ) : (
            <>
              <p className={`text-[12px] ${st.tone}`}>Not posted</p>
              <p className="text-[11px] normal-case leading-relaxed text-warm">{result.reason ?? "It didn't pass the check."}</p>
              <button type="button" onClick={() => setStep("form")} className="btn-press min-h-10 border-2 border-border text-[10px] text-cream hover:border-lime/60">
                Edit and try again
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="btn-press min-h-9 text-[10px] text-muted hover:text-cream">
            Close
          </button>
        </div>
      </Overlay>
    );
  }

  if (step === "sending")
    return (
      <Overlay title={title} onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 size={20} className="animate-spin text-lime" aria-hidden />
          <p className="text-[10px] text-cream">Checking your project</p>
          <p className="text-[10px] normal-case text-muted">We open the link and read the page. A few seconds.</p>
        </div>
      </Overlay>
    );

  if (step === "link")
    return (
      <Overlay title={title} onClose={onClose}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void prefill();
          }}
        >
          <p className="text-[11px] normal-case leading-relaxed text-warm">Paste the link. We fill in the rest from the page; you fix what&apos;s wrong.</p>
          <Field label="Link (site, app or GitHub repo)">
            <input id="project-url" className={input} value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" inputMode="url" autoComplete="url" autoFocus maxLength={LIMITS.url} />
          </Field>
          {error && <p className="text-[10px] normal-case text-red-400">{error}</p>}
          <button type="submit" disabled={busy || !form.url.trim()} className="btn-press flex min-h-10 items-center justify-center gap-1.5 bg-lime text-[10px] text-bg disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ArrowRight size={13} aria-hidden />} {busy ? "Reading the page" : "Continue"}
          </button>
          <ul className="flex flex-col gap-1 border-t-2 border-border pt-3 text-[9px] normal-case text-muted">
            <li>· One project a week. Editing it is free; deleting it doesn&apos;t give the week back.</li>
            <li>· {lateWeek ? "Posted now, it competes next week (this one closes in under a day)." : "It competes this week, until Sunday 21h (Brasília)."}</li>
            <li>· Betting, casino and get-rich links are refused.</li>
          </ul>
        </form>
      </Overlay>
    );

  return (
    <Overlay title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {note && <p className="border-2 border-border bg-bg-raised px-3 py-2 text-[10px] normal-case text-muted">{note}</p>}
        {editing && editing.status === "live" && <p className="text-[9px] normal-case text-muted">Changing the link sends it back to review. Votes stay.</p>}
        <Field label="Link">
          <input id="project-url-edit" className={input} value={form.url} onChange={(e) => set("url", e.target.value)} inputMode="url" maxLength={LIMITS.url} required />
        </Field>
        <Field label="Name" count={form.name.length} max={LIMITS.name}>
          <input id="project-name" className={input} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Tagline · what it does, in a line" count={form.tagline.length} max={LIMITS.tagline}>
          <input id="project-tagline" className={input} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} required />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[9px] text-muted">Category</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={form.category === c.id}
                onClick={() => set("category", c.id)}
                className={`btn-press border-2 px-2.5 py-1.5 text-[9px] ${form.category === c.id ? "border-lime bg-lime text-bg" : "border-border text-cream hover:border-lime/60"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="GitHub repo (optional)">
          <input id="project-repo" className={input} value={form.repo} onChange={(e) => set("repo", e.target.value)} placeholder="github.com/you/project" />
        </Field>
        <Field label="Description (optional)" count={form.description.length} max={LIMITS.description}>
          <textarea id="project-description" className={`${input} min-h-[96px] resize-y`} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        {error && <p className="text-[10px] normal-case text-red-400">{error}</p>}
        <button type="submit" className="btn-press min-h-10 bg-lime text-[10px] text-bg">
          {editing ? "Save" : "Post project"}
        </button>
        {!editing && (
          <button type="button" onClick={() => setStep("link")} className="text-[9px] text-muted hover:text-cream">
            Use another link
          </button>
        )}
      </form>
    </Overlay>
  );
}
