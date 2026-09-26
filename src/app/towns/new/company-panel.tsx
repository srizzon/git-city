"use client";

import { useState } from "react";
import { NO_AUTOFILL } from "@/components/league/hud/shared";
import type { OrgState } from "@/lib/towns/company-orgs";
import { colleaguesLabel, type CompanyStep, type OrgCheck } from "@/lib/towns/company-step";

// The Company tab in two steps. Step 1 finds the org and checks, as you type,
// that you're in it: nothing is built there. Step 2 is the town: pick a
// starter city and build it, or move into the town that's already there.

const NOTE = "border-[3px] border-border bg-bg-card px-3 py-3 text-[11px] leading-relaxed text-muted normal-case";

export type CompanyStage = "org" | "city";

/** "1 Your org · 2 Your town", the current one lit. */
export function CompanySteps({ stage }: { stage: CompanyStage }) {
  const items: [CompanyStage, string][] = [
    ["org", "Your org"],
    ["city", "Your town"],
  ];
  return (
    <ol aria-label="Steps" className="mx-5 mt-4 flex gap-5 text-[10px]">
      {items.map(([id, label], i) => {
        const on = id === stage;
        const done = stage === "city" && id === "org";
        return (
          <li key={id} aria-current={on ? "step" : undefined} className={`flex items-center gap-2 ${on ? "text-lime" : done ? "text-cream" : "text-dim"}`}>
            <span className={`flex h-5 w-5 items-center justify-center border-2 ${on ? "border-lime" : done ? "border-cream" : "border-dim"}`}>
              {done ? "✓" : i + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/** Step 1: which org, and what GitHub says about you in it. */
export function OrgStep({
  login,
  orgs,
  input,
  onInput,
  onPick,
  check,
  step,
  checking,
}: {
  /** The viewer's GitHub login, for the picture of their row on GitHub. */
  login: string;
  /** Orgs GitHub listed after the read:org sign-in. */
  orgs: OrgState[];
  input: string;
  onInput: (v: string) => void;
  onPick: (org: string) => void;
  /** The last check, only when it's for what the input says now. */
  check: OrgCheck | null;
  step: CompanyStep;
  checking: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 px-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted">Your org on GitHub</span>
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="your-org"
          aria-label="GitHub org"
          aria-describedby="org-status"
          aria-invalid={step.kind === "no_account" || step.kind === "person"}
          {...NO_AUTOFILL}
          autoCapitalize="off"
          spellCheck={false}
          className="border-[3px] border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-sm"
        />
      </label>

      {orgs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {orgs.map((o) => (
            <button
              key={o.login}
              type="button"
              onClick={() => onPick(o.login)}
              className={`btn-press flex items-center gap-2 border-2 px-2 py-1 text-[10px] normal-case transition-colors ${
                check?.org === o.login ? "border-lime text-lime" : "border-border text-cream hover:border-muted"
              }`}
            >
              <OrgAvatar url={o.avatar_url} login={o.login} size={16} />@{o.login}
            </button>
          ))}
        </div>
      )}

      <div id="org-status" aria-live="polite">
        <OrgStatus check={check} step={step} checking={checking} input={input} />
      </div>

      {/* Only while we can't see you in the org yet: a verified dev has nothing to fix. */}
      {(step.kind === "none" || step.kind === "not_member" || step.kind === "github_down") && (
        <PublicGuide login={login} org={check?.org ?? null} open={step.kind === "not_member"} />
      )}
    </div>
  );
}

function OrgStatus({ check, step, checking, input }: { check: OrgCheck | null; step: CompanyStep; checking: boolean; input: string }) {
  const typed = input.trim().replace(/^@/, "");
  if (checking) return <p className="text-[11px] text-muted normal-case">{`Checking ${typed ? `@${typed}` : "the org"} on GitHub…`}</p>;
  if (!check) return <p className="text-[11px] leading-relaxed text-muted normal-case">The name in its address: github.com/your-org.</p>;
  const bad = "text-[11px] leading-relaxed text-red-400 normal-case";
  const ok = "text-[11px] leading-relaxed text-cream normal-case";
  switch (step.kind) {
    case "no_account":
      return <p className={bad}>{`There's no @${check.org} on GitHub. Check the spelling in its address.`}</p>;
    case "person":
      return <p className={bad}>{`@${check.org} is a person's account, not an org.`}</p>;
    case "github_down":
      return <p className={bad}>GitHub didn&apos;t answer. Try again in a moment.</p>;
    case "not_member":
      return <p className={bad}>{`We can't see you in @${check.org}. Make your membership public, then check again.`}</p>;
    case "removed":
      return <p className={bad}>{`The admin of ${check.townLabel} removed you. Ask them for a new invite.`}</p>;
    case "open":
      return <p className={ok}>{`✓ You live in ${check.townLabel}.`}</p>;
    case "move_in":
      return (
        <p className={ok}>
          <span className="text-lime">{`✓ You're in @${check.org}.`}</span>{" "}
          {`${check.townLabel} is already built${check.town && check.town.buildings >= 2 ? `, ${check.town.buildings} buildings` : ""}.`}
        </p>
      );
    case "build":
      return (
        <p className={ok}>
          <span className="text-lime">{`✓ You're in @${check.org}.`}</span> {`${check.townLabel} isn't built yet. You'll build it next.`}
        </p>
      );
    default:
      return null;
  }
}

/** Step 2's top: the town you're building or moving into, and what comes with it. */
export function CityStepNote({ check, step }: { check: OrgCheck; step: CompanyStep }) {
  return (
    <div className="mt-4 flex flex-col gap-2 px-5">
      <div className="flex items-center gap-3 border-[3px] border-border bg-bg-card px-3 py-2">
        <OrgAvatar url={check.avatarUrl} login={check.org} size={24} />
        <span className="min-w-0 flex-1 truncate text-xs text-cream normal-case">{check.townLabel}</span>
        <span className="shrink-0 text-[10px] text-muted normal-case">@{check.org}</span>
      </div>
      {step.kind === "build" && (
        <p className="text-[11px] leading-relaxed text-muted normal-case">
          {check.colleagues === null
            ? "Pick its starter city. You can change everything later."
            : check.colleagues > 0
              ? `Pick its starter city. ${colleaguesLabel(check.colleagues)} with a public membership come in as dark buildings and light up when they move in.`
              : "Pick its starter city. It's just you for now: colleagues move in when they check the org."}
        </p>
      )}
      {step.kind === "open" && <p className="text-[11px] leading-relaxed text-muted normal-case">You already live here.</p>}
      {step.kind === "move_in" && (
        <p className="text-[11px] leading-relaxed text-muted normal-case">
          {step.invited ? "Your building is already there with the lights off. Move in to turn them on." : "Move in and your building joins its skyline."}
        </p>
      )}
      {(step.kind === "build" || step.kind === "move_in") && step.leaving && (
        <p className="text-[11px] leading-relaxed text-orange-300 normal-case">
          You&apos;ll leave {step.leaving}. You can live in one company town at a time.
        </p>
      )}
    </div>
  );
}

/**
 * How to make an org membership public, with a picture of the GitHub row
 * the dev will see. Folded until it's needed: it opens by itself when we
 * can't see the dev in the org.
 */
function PublicGuide({ login, org, open }: { login: string; org: string | null; open: boolean }) {
  const [manual, setManual] = useState(false);
  const shown = open || manual;
  const peopleUrl = org ? `https://github.com/orgs/${org}/people` : null;
  return (
    <div className={shown ? `${NOTE} flex flex-col gap-3` : ""}>
      {open ? (
        <p className="text-cream">Make your membership public</p>
      ) : (
        <button
          type="button"
          onClick={() => setManual((m) => !m)}
          aria-expanded={shown}
          className="flex w-full items-center justify-between text-left text-[10px] text-muted transition-colors hover:text-cream"
        >
          <span className="normal-case">Private member? How to make it public</span>
          <span aria-hidden>{shown ? "−" : "+"}</span>
        </button>
      )}
      {shown && (
        <>
          <ol className="flex flex-col gap-3">
            <li className="flex gap-2">
              <span className="text-lime">1</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span>Open your org&apos;s people page:</span>
                {peopleUrl ? (
                  <a href={peopleUrl} target="_blank" rel="noopener noreferrer" className="break-words text-cream underline underline-offset-2 hover:text-lime">
                    github.com/orgs/{org}/people ↗
                  </a>
                ) : (
                  <span className="break-words text-cream">github.com/orgs/your-org/people</span>
                )}
              </span>
            </li>
            <li className="flex flex-col gap-2">
              <span className="flex gap-2">
                <span className="text-lime">2</span>
                <span>
                  Find your name, click <span className="text-cream">Private</span> and pick <span className="text-cream">Public</span>:
                </span>
              </span>
              <GitHubRow login={login} />
            </li>
            <li className="flex gap-2">
              <span className="text-lime">3</span>
              <span>Come back and press Check again. GitHub can take a minute.</span>
            </li>
          </ol>
          <p className="text-[10px] text-dim">We only check that you&apos;re a member. Never your code.</p>
          {org && (
            <a href={`/api/leagues/verify?org=${encodeURIComponent(org)}`} className="self-start text-[10px] text-muted underline-offset-2 hover:text-cream hover:underline">
              Rather keep it private? Try GitHub org access (works if @{org} allows Git City)
            </a>
          )}
        </>
      )}
    </div>
  );
}

/** A drawing of the row on GitHub's people page, with the visibility menu open. */
function GitHubRow({ login }: { login: string }) {
  return (
    <div aria-hidden className="ml-4 border border-[#30363d] bg-[#0d1117] px-3 pt-2 pb-3 font-sans text-[12px] normal-case tracking-normal">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://github.com/${login}.png?size=40`} alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
        <span className="min-w-0 flex-1 truncate text-[#4493f8]">{login}</span>
        <span className="flex shrink-0 items-center gap-1 text-[#9198a1]">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden>
            <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2Z" />
          </svg>
          Private ▾
        </span>
      </div>
      <div className="mt-2 ml-auto w-[80%] max-w-[220px] overflow-hidden rounded-md border border-[#3d444d] bg-[#151b23]">
        <p className="border-b border-[#3d444d] px-2 py-1 text-[11px] font-semibold text-[#f0f6fc]">Organization visibility</p>
        <p className="bg-[#1f6feb] px-2 py-1 font-semibold text-white">Public</p>
        <p className="px-2 py-1 text-[#9198a1]">✓ Private</p>
      </div>
    </div>
  );
}

function OrgAvatar({ url, login, size }: { url: string | null; login: string; size: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />
  ) : (
    <span aria-hidden style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center bg-border text-[9px] text-cream">
      {login.slice(0, 1)}
    </span>
  );
}
