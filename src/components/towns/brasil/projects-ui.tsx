"use client";

import { useState, type ReactNode } from "react";
import Panel from "@/components/league/hud/Panel";
import { Board, useWide } from "./BrasilPanels";
import { ChevronUp } from "lucide-react";
import posthog from "posthog-js";
import type { ProjectCard } from "@/lib/towns/brasil-projects";

// Pieces every projects surface shares (the map's card, the project sheet,
// the list page): the icon, the upvote button and the calls behind them.

export const api = (slug: string) => `/api/towns/${slug}/brasil/projects`;
/** Where a project's Visit goes: through the click-through, which counts it and re-checks the link. */
export const visitHref = (slug: string, id: number) => `/api/towns/${slug}/brasil/go?p=${id}`;
export const adHref = (slug: string, id: number) => `/api/towns/${slug}/brasil/go?ad=${id}`;
/** A project's share link: the map with its sheet open. */
export const shareUrl = (slug: string, project: string) => `${typeof window === "undefined" ? "https://thegitcity.com" : window.location.origin}/town/${slug}?project=${project}`;

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; code?: string }> {
  try {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (j as { error?: string }).error ?? "Something went wrong. Try again.", status: r.status, code: (j as { code?: string }).code };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: "No connection. Try again.", status: 0 };
  }
}

/** The project's icon: its site's, else the maker's GitHub avatar, else a block. */
export function ProjectIcon({ project, size = 22 }: { project: Pick<ProjectCard, "icon" | "maker">; size?: number }) {
  const [src, setSrc] = useState(project.icon ?? project.maker.avatar);
  const fallback = project.maker.avatar;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote icons from any site
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSrc(src !== fallback ? fallback : null)}
      // A site's icon is often dark on transparent: it sits on light, like a browser tab.
      className={`shrink-0 object-cover ${src === project.icon ? "bg-[#eef0ea]" : "bg-bg-raised"}`}
      style={{ width: size, height: size, imageRendering: size <= 24 ? "pixelated" : undefined }}
    />
  ) : (
    <span className="shrink-0 bg-border-light" style={{ width: size, height: size }} aria-hidden />
  );
}

/**
 * The upvote: ▲ and the count. Signed out, it asks to sign in; on your own
 * project it's just the count. Optimistic, rolled back if the server says no.
 */
export function VoteButton({
  slug,
  project,
  signedIn,
  mine,
  from,
  onSignIn,
  onChange,
  size = "sm",
}: {
  slug: string;
  project: Pick<ProjectCard, "id" | "votes" | "voted">;
  signedIn: boolean;
  mine?: boolean;
  from: string;
  onSignIn: () => void;
  onChange?: (v: { votes: number; voted: boolean }) => void;
  /** sm: the card and lists; lg: a square count; hero: full width with the word. */
  size?: "sm" | "lg" | "hero";
}) {
  const [state, setState] = useState({ votes: project.votes, voted: project.voted });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const big = size !== "sm";
  const hero = size === "hero";
  const click = async () => {
    if (mine || busy) return;
    if (!signedIn) {
      posthog.capture("project_vote_signin", { project_id: project.id, from });
      onSignIn();
      return;
    }
    const on = !state.voted;
    const before = state;
    setBusy(true);
    setState({ votes: state.votes + (on ? 1 : -1), voted: on });
    const r = await postJson<{ votes: number; voted: boolean; counted: boolean }>(`${api(slug)}/${project.id}`, { action: "vote", on });
    setBusy(false);
    if (!r.ok) {
      setState(before);
      setNote(r.error);
      return;
    }
    const next = { votes: r.data.votes, voted: r.data.voted };
    setState(next);
    onChange?.(next);
    posthog.capture(on ? "project_voted" : "project_unvoted", { project_id: project.id, from, counted: r.data.counted });
  };
  return (
    <span className={`flex shrink-0 flex-col items-end ${hero ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void click();
        }}
        disabled={mine}
        aria-pressed={state.voted}
        aria-label={mine ? `${state.votes} upvotes` : state.voted ? `Upvoted, ${state.votes} upvotes. Take it back` : `Upvote, ${state.votes} upvotes`}
        className={`btn-press flex items-center justify-center gap-1 border-2 tabular-nums transition-colors ${hero ? "min-h-12 w-full gap-2 px-4 text-[12px]" : big ? "min-h-10 min-w-[84px] px-3 text-[11px]" : "min-h-7 min-w-[46px] px-1.5 text-[9px]"} ${
          hero
            ? state.voted
              ? "border-lime text-lime"
              : mine
                ? "border-border text-muted"
                : "border-lime bg-lime text-bg"
            : state.voted
              ? "border-lime bg-lime text-bg"
              : mine
                ? "border-border text-muted"
                : "border-border-light text-cream hover:border-lime hover:text-lime"
        }`}
      >
        <ChevronUp size={big ? 14 : 11} strokeWidth={3} aria-hidden />
        {hero && <span>{mine ? "Upvotes" : state.voted ? "Upvoted" : "Upvote"}</span>}
        {!hero && state.votes}
      </button>
      {note && <span className="mt-1 max-w-[160px] text-right text-[8px] normal-case text-red-400">{note}</span>}
    </span>
  );
}

/** A form or a list over the map: a board in the middle on a wide screen, the bottom sheet on a phone. */
export function Overlay({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const wide = useWide();
  return wide ? (
    <Board title={title} onClose={onClose} width={width}>
      {children}
    </Board>
  ) : (
    <Panel title={title} onClose={onClose}>
      {children}
    </Panel>
  );
}
