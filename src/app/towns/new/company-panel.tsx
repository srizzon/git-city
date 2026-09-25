"use client";

import { useState } from "react";
import { NO_AUTOFILL } from "@/components/league/hud/shared";
import type { OrgState } from "@/lib/towns/company-orgs";
import { colleaguesLabel, type CompanyStep, type OrgCheck } from "@/lib/towns/company-step";

// The Company tab's org part: which org, what we found out, and what to do
// about it. Checking only reads; the screen's one button (in NewTown) is what
// builds or moves in.

const NOTE = "border-[3px] border-border bg-bg-card px-3 py-3 text-[11px] leading-relaxed text-muted normal-case";

export function CompanyPanel({
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
        <OrgPicker orgs={orgs} input={input} onInput={onInput} onCheck={onCheck} checking={checking} check={check} step={step} />
      ) : (
        check && <OrgResult check={check} step={step} onChange={onChange} checking={checking} />
      )}
      {notice && <p className="border-[3px] border-lime/60 bg-bg-card px-3 py-2 text-[11px] leading-relaxed text-cream normal-case">{notice}</p>}
      {(picking || step.kind === "not_member") && <Questions />}
    </div>
  );
}

function OrgPicker({
  orgs,
  input,
  onInput,
  onCheck,
  checking,
  check,
  step,
}: {
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
          placeholder="your-org or github.com/your-org"
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
      {orgs.length === 0 && !check && (
        <p className="text-[11px] leading-relaxed text-muted normal-case">
          It&apos;s the name in your org&apos;s GitHub address. We only check that you&apos;re a member.
        </p>
      )}

      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, full navigation */}
      <a href="/api/leagues/verify" className="self-start text-[10px] text-muted underline-offset-2 transition-colors hover:text-cream hover:underline">
        {orgs.length > 0 ? "Refresh my orgs from GitHub" : "Or let GitHub list my orgs"}
      </a>
    </>
  );
}

function OrgResult({ check, step, onChange, checking }: { check: OrgCheck; step: CompanyStep; onChange: () => void; checking: boolean }) {
  const peopleUrl = `https://github.com/orgs/${check.org}/people`;
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
        <div className={`${NOTE} flex flex-col gap-3`}>
          <p>
            <span className="text-cream">We can&apos;t see you in @{check.org} yet.</span>{" "}
            {check.standing === "invited"
              ? "Your building is already in its town with the lights off. "
              : ""}
            Most company orgs keep members private, so show yours on GitHub:
          </p>
          <ol className="flex flex-col gap-2">
            <li className="flex gap-2">
              <span className="text-lime">1</span>
              <span>
                Open{" "}
                <a href={peopleUrl} target="_blank" rel="noopener noreferrer" className="text-cream underline underline-offset-2 hover:text-lime">
                  github.com/orgs/{check.org}/people ↗
                </a>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-lime">2</span>
              <span>
                Find your name, click <span className="text-cream">Private</span> and pick <span className="text-cream">Public</span>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-lime">3</span>
              <span>Come back and check again. GitHub can take a minute to update.</span>
            </li>
          </ol>
          <a href={`/api/leagues/verify?org=${encodeURIComponent(check.org)}`} className="self-start text-[10px] text-muted underline-offset-2 hover:text-cream hover:underline">
            Rather keep it private? Try GitHub org access (works if @{check.org} allows Git City)
          </a>
        </div>
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

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Does Git City see my company's code?",
    a: "No. We only check that you're a member of the org. No repos, no code, nothing private.",
  },
  {
    q: "Why make my membership public?",
    a: "GitHub only tells apps who's in an org when the membership is public, or when the org approved the app. Most company orgs haven't. Public shows the org on your GitHub profile.",
  },
  {
    q: "Can I switch it back to private?",
    a: "Keep it public while you live in the town. We check once a day, and a private membership moves you out.",
  },
  {
    q: "My company isn't a GitHub org",
    a: "Then it can't have a company town yet. Build a Friends town and invite your colleagues by their GitHub names.",
  },
];

function Questions() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col border-t-2 border-border pt-2">
      {QUESTIONS.map((x, i) => (
        <div key={x.q}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-[10px] text-muted transition-colors hover:text-cream"
          >
            <span className="normal-case">{x.q}</span>
            <span aria-hidden>{open === i ? "−" : "+"}</span>
          </button>
          {open === i && <p className="pb-2 text-[11px] leading-relaxed text-muted normal-case">{x.a}</p>}
        </div>
      ))}
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
