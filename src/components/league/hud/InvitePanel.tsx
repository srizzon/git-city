"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PixelSpinner, { Pending } from "@/components/leagues/PixelSpinner";
import Panel from "./Panel";
import { Check, Copy, Share2 } from "lucide-react";
import type { JoinMode } from "@/lib/towns/joining";
import type { LeagueMemberRow } from "@/lib/leagues/queries";
import { Avatar, NO_AUTOFILL } from "./shared";

type InviteState =
  | { kind: "idle" }
  | { kind: "sending"; login: string }
  | { kind: "done"; login: string; avatar: string | null; link: string }
  | { kind: "error"; message: string };

/** What happens to whoever opens the group link, by who shares it and the town's setting. */
function groupHint(kind: "company" | "custom", mode: JoinMode, isAdmin: boolean): string {
  if (kind === "company") return "Colleagues open it and verify on GitHub to move in.";
  if (isAdmin) return "Anyone who opens it moves straight in. Make a new one in settings to turn it off.";
  if (mode === "open") return "Anyone who opens it can join.";
  if (mode === "request") return "People who open it can ask to join. The admin lets them in.";
  return "People who open it can visit. To bring someone in, invite them by username below.";
}

export default function InvitePanel({
  slug,
  viewerLogin,
  pending,
  groupLink,
  kind,
  joinMode,
  isAdmin,
  onClose,
}: {
  slug: string;
  viewerLogin: string;
  pending: LeagueMemberRow[];
  /** The link for a WhatsApp or Slack group (see groupInviteLink). */
  groupLink: string | null;
  kind: "company" | "custom";
  joinMode: JoinMode;
  isAdmin: boolean;
  onClose: () => void;
}) {
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
      setState({ kind: "done", login: json.login, avatar: `https://github.com/${json.login}.png?size=64`, link: json.link });
      setLogin("");
      // Re-fetch the page so the new building shows up in the city.
      startRefresh(() => router.refresh());
    } catch {
      setState({ kind: "error", message: "Network error. Try again." });
    }
  }

  const [copiedLogin, setCopiedLogin] = useState<string | null>(null);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // Same personal link the invite returned: ref = whoever is sharing it now.
  async function copyPending(login: string) {
    const link = `${window.location.origin}/town/${slug}?ref=${encodeURIComponent(viewerLogin)}&invite=${encodeURIComponent(login)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLogin(login);
      setTimeout(() => setCopiedLogin((c) => (c === login ? null : c)), 1800);
    } catch {
      setCopiedLogin(null);
    }
  }
  const [groupCopied, setGroupCopied] = useState(false);
  async function copyGroup() {
    if (!groupLink) return;
    try {
      await navigator.clipboard.writeText(groupLink);
      setGroupCopied(true);
      setTimeout(() => setGroupCopied(false), 1800);
    } catch {
      setGroupCopied(false);
    }
  }
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function shareGroup() {
    if (!groupLink) return;
    try {
      await navigator.share({ url: groupLink });
    } catch {
      // cancelled
    }
  }

  const justInvited = state.kind === "done" ? state.login.toLowerCase() : null;
  const others = pending.filter((m) => m.login.toLowerCase() !== justInvited);

  return (
    <Panel title="Invite people" onClose={onClose}>
      {groupLink && (
        <section>
          <h3 className="text-[10px] text-cream">Group link</h3>
          <p className="mt-1 text-[11px] text-muted normal-case">{groupHint(kind, joinMode, isAdmin)}</p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={groupLink}
              aria-label="Group invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-2 py-2 text-[11px] text-cream normal-case outline-none"
            />
            <button
              type="button"
              onClick={copyGroup}
              className={`btn-press flex min-w-[92px] items-center justify-center gap-1.5 px-3 text-[10px] ${groupCopied ? "bg-lime text-bg" : "border-2 border-lime text-lime"}`}
            >
              {groupCopied ? <Check size={12} strokeWidth={3} aria-hidden /> : <Copy size={12} strokeWidth={2.5} aria-hidden />}
              {groupCopied ? "Copied" : "Copy"}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={shareGroup}
                aria-label="Share the group link"
                className="btn-press flex w-10 items-center justify-center border-2 border-border text-cream hover:border-lime"
              >
                <Share2 size={12} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </div>
        </section>
      )}

      <h3 className={`text-[10px] text-cream ${groupLink ? "mt-6" : ""}`}>By GitHub username</h3>
      <p className="mt-1 text-[11px] text-muted normal-case">Their building joins the city faded until they sign in.</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="GitHub username"
          aria-label="GitHub username"
          {...NO_AUTOFILL}
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
                <p className="truncate text-xs text-cream normal-case">@{state.login} is in the city</p>
                <p className="flex items-center gap-2 text-[10px] text-muted normal-case">
                  {refreshing ? (
                    <>
                      <PixelSpinner size={4} /> Placing their building
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

      {others.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[10px] text-muted">Pending · {others.length}</h3>
          <ul className="mt-2 divide-y-2 divide-border border-2 border-border">
            {others.map((m) => (
              <li key={m.developer_id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar src={m.avatar_url} size={20} faded />
                <span className="min-w-0 flex-1 truncate text-[11px] text-cream normal-case">@{m.login}</span>
                <button
                  type="button"
                  onClick={() => copyPending(m.login)}
                  className={`btn-press flex min-w-[88px] items-center justify-center gap-1.5 border-2 px-2 py-1 text-[9px] transition-colors ${
                    copiedLogin === m.login ? "border-lime bg-lime text-bg" : "border-border text-cream hover:border-lime"
                  }`}
                >
                  {copiedLogin === m.login ? <Check size={11} strokeWidth={3} aria-hidden /> : <Copy size={11} strokeWidth={2.5} aria-hidden />}
                  {copiedLogin === m.login ? "Copied" : "Copy link"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
