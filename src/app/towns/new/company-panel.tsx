"use client";

import { NO_AUTOFILL } from "@/components/league/hud/shared";
import type { OrgState } from "@/lib/towns/company-orgs";
import { colleaguesLabel, normalizeOrgInput, type CompanyStep, type OrgCheck } from "@/lib/towns/company-step";

// The Company tab's org part: which org, what we found out, and what to do
// about it. Checking only reads; the screen's one button (in NewTown) is what
// builds or moves in.

const NOTE = "border-[3px] border-border bg-bg-card px-3 py-3 text-[11px] leading-relaxed text-muted normal-case";

export function CompanyPanel({
  login,
  orgs,
  input,
  onInput,
  onCheck,
  onChange,
  check,
  step,
  checking,
  notice,
}: {
  /** The viewer's GitHub login, for the picture of their row on GitHub. */
  login: string;
  /** Orgs GitHub listed after the read:org sign-in. */
  orgs: OrgState[];
  input: string;
  onInput: (v: string) => void;
  /** Checks an org: the typed one, or a listed one. */
  onCheck: (org?: string) => void;
  /** Back to picking an org. */
  onChange: () => void;
  check: OrgCheck | null;
  step: CompanyStep;
  checking: boolean;
  /** A heads-up after the town changed under the dev (someone built it first). */
  notice: string | null;
}) {
  const picking = !check || step.kind === "no_account" || step.kind === "person";
  return (
    <div className="mt-4 flex flex-col gap-3 px-5" aria-live="polite">
      {picking ? (
        <OrgPicker login={login} orgs={orgs} input={input} onInput={onInput} onCheck={onCheck} checking={checking} check={check} step={step} />
      ) : (
        check && <OrgResult login={login} check={check} step={step} onChange={onChange} checking={checking} />
      )}
      {notice && <p className="border-[3px] border-lime/60 bg-bg-card px-3 py-2 text-[11px] leading-relaxed text-cream normal-case">{notice}</p>}
    </div>
  );
}

function OrgPicker({
  login,
  orgs,
  input,
  onInput,
  onCheck,
  checking,
  check,
  step,
}: {
  login: string;
  orgs: OrgState[];
  input: string;
  onInput: (v: string) => void;
  onCheck: (org?: string) => void;
  checking: boolean;
  check: OrgCheck | null;
  step: CompanyStep;
}) {
  return (
    <>
      {orgs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted">Your orgs</span>
          {orgs.map((o) => (
            <button
              key={o.login}
              type="button"
              disabled={checking}
              onClick={() => onCheck(o.login)}
              className="btn-press flex items-center gap-3 border-[3px] border-border bg-bg-card px-3 py-2 text-left transition-colors hover:border-muted disabled:opacity-50"
            >
              <OrgAvatar url={o.avatar_url} login={o.login} />
              <span className="min-w-0 flex-1 truncate text-xs text-cream normal-case">@{o.login}</span>
              <span className="shrink-0 text-[10px] text-muted">{o.league ? (o.joined ? "You live here" : "Town built") : "No town yet"}</span>
            </button>
          ))}
          <p className="text-[10px] leading-relaxed text-muted normal-case">
            Only orgs that allow Git City show up here. Most companies block apps, so if yours is missing, type it below.
          </p>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted">{orgs.length > 0 ? "Another org" : "Your org on GitHub"}</span>
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCheck();
            }
          }}
          disabled={checking}
          placeholder="your-org"
          aria-label="GitHub org"
          aria-invalid={step.kind === "no_account" || step.kind === "person"}
          {...NO_AUTOFILL}
          autoCapitalize="off"
          spellCheck={false}
          className="border-[3px] border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime disabled:opacity-60 sm:text-sm"
        />
      </label>

      {check && step.kind === "no_account" && (
        <p className="text-[11px] leading-relaxed text-red-400 normal-case">
          There&apos;s no @{check.org} on GitHub. Use the name in your org&apos;s address: github.com/<span className="text-cream">name</span>.
        </p>
      )}
      {check && step.kind === "person" && (
        <p className="text-[11px] leading-relaxed text-red-400 normal-case">
          {`@${check.org} is a person's account, not an org. Company towns belong to GitHub orgs.`}
        </p>
      )}
      <PublicGuide login={login} org={normalizeOrgInput(input)} again={false} />

      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, full navigation */}
      <a href="/api/leagues/verify" className="self-start text-[10px] text-muted underline-offset-2 transition-colors hover:text-cream hover:underline">
        {orgs.length > 0 ? "Refresh my orgs from GitHub" : "Or let GitHub list the orgs that allow Git City"}
      </a>
    </>
  );
}

function OrgResult({
  login,
  check,
  step,
  onChange,
  checking,
}: {
  login: string;
  check: OrgCheck;
  step: CompanyStep;
  onChange: () => void;
  checking: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-3 border-[3px] border-lime bg-bg-raised px-3 py-2">
        <OrgAvatar url={check.avatarUrl} login={check.org} />
        <span className="min-w-0 flex-1 truncate text-xs text-lime normal-case">@{check.org}</span>
        <button type="button" onClick={onChange} disabled={checking} className="shrink-0 text-[10px] text-muted transition-colors hover:text-cream">
          Change
        </button>
      </div>

      {step.kind === "github_down" && <p className={NOTE}>GitHub didn&apos;t answer. Try again in a moment.</p>}

      {step.kind === "not_member" && (
        <>
          <p className="text-[11px] leading-relaxed text-muted normal-case">
            <span className="text-cream">We can&apos;t see you in @{check.org} yet.</span>{" "}
            {check.standing === "invited" ? "Your building is already in its town with the lights off. " : ""}
            Your membership is private, or GitHub hasn&apos;t updated yet.
          </p>
          <PublicGuide login={login} org={check.org} again />
          <a
            href={`/api/leagues/verify?org=${encodeURIComponent(check.org)}`}
            className="self-start text-[10px] text-muted underline-offset-2 hover:text-cream hover:underline"
          >
            Rather keep it private? Try GitHub org access (works if @{check.org} allows Git City)
          </a>
        </>
      )}

      {step.kind === "build" && (
        <p className={NOTE}>
          <span className="text-cream">{check.townLabel} isn&apos;t built yet.</span> You build it: pick its starter city.{" "}
          {check.colleagues === null
            ? null
            : check.colleagues > 0
              ? `${colleaguesLabel(check.colleagues)} with a public membership come in as dark buildings. Their lights turn on when they move in.`
              : "It's just you for now. Colleagues move in when they check the org here."}
        </p>
      )}

      {step.kind === "move_in" && (
        <p className={NOTE}>
          <span className="text-cream">{check.townLabel} is already built</span>
          {check.town && check.town.buildings >= 2 ? `, ${check.town.buildings} buildings.` : "."}{" "}
          {step.invited ? "Your building is there with the lights off. Move in to turn them on." : "Move in and your building joins its skyline."}
        </p>
      )}

      {(step.kind === "build" || step.kind === "move_in") && step.leaving && (
        <p className="text-[11px] leading-relaxed text-orange-300 normal-case">
          You&apos;ll leave {step.leaving}. You can live in one company town at a time.
        </p>
      )}

      {step.kind === "open" && <p className={NOTE}>You live in {check.townLabel}.</p>}

      {step.kind === "removed" && (
        <p className={NOTE}>
          <span className="text-cream">The admin of {check.townLabel} removed you.</span> Ask them for a new invite.
        </p>
      )}
    </>
  );
}

/**
 * How to make an org membership public, with a picture of the GitHub row
 * the dev will see: their name, "Private", and the menu with "Public".
 */
function PublicGuide({ login, org, again }: { login: string; org: string | null; again: boolean }) {
  const peopleUrl = org ? `https://github.com/orgs/${org}/people` : null;
  return (
    <div className={`${NOTE} flex flex-col gap-3`}>
      <p className="text-cream">{again ? "Make your membership public" : "Private member? Make it public first"}</p>
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
          <span>{again ? "Come back and check again. GitHub can take a minute." : "Come back and check your org here."}</span>
        </li>
      </ol>
      <p className="text-[10px] text-dim">We only check that you&apos;re a member. Never your code.</p>
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

function OrgAvatar({ url, login }: { url: string | null; login: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
  ) : (
    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center bg-border text-[10px] text-cream">
      {login.slice(0, 1)}
    </span>
  );
}
