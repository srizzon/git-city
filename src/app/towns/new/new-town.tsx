"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import { Pending } from "@/components/leagues/PixelSpinner";
import { NO_AUTOFILL } from "@/components/league/hud/shared";
import { generateCityLayout, type CityBuilding, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { starterObjects, starterOps } from "@/lib/league-city/starter";
import { LOT, bounds } from "@/lib/league-city/grid";
import { COMPANY_TEMPLATE, DEFAULT_TEMPLATE, JOIN_LABEL, SCORING_LABEL, TEMPLATES, templateFor, type TemplateId } from "@/lib/league-city/templates";
import type { CityIdentity, CityObject } from "@/lib/league-city/types";
import type { LeagueCity } from "@/lib/league-city/service";
import type { OrgState } from "@/lib/towns/company-orgs";
import type { ScoringMode } from "@/lib/leagues/scoring";
import { JOIN_MODES, type JoinMode } from "@/lib/towns/joining";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), { ssr: false, loading: () => null });

const IDENTITY: CityIdentity = { sky: 1, signSide: null, logoUrl: null, logoRemoved: false, identityVersion: 0 };
/** The panel slides out and the camera pushes in before the town page takes over. */
const LEAVE_MS = 700;
/** The panel's width on wide screens (lg:w-[440px]). */
const PANEL_W = 440;

export type TownKind = "friends" | "company";

// Create a town like a game makes a world (Roblox's template gallery,
// Minecraft's Create World): the picked starter city stands live behind the
// panel, the name comes filled in, settings sit right under it. Two kinds:
// a friends town (named by you, you pick who joins) or your company's town
// (one per GitHub org, members verify on GitHub; its first member picks the
// city).
export default function NewTown({
  viewer,
  cityDevs,
  cityNorms,
  startKind,
  startTemplate,
  startName,
  orgs,
  startOrg,
  verifyFailed,
}: {
  viewer: { id: number; login: string; claimed: boolean } | null;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  startKind: TownKind;
  startTemplate: TemplateId | null;
  startName: string | null;
  /** Orgs the viewer verified on GitHub, with their towns. */
  orgs: OrgState[];
  startOrg: string | null;
  verifyFailed: boolean;
}) {
  const [kind, setKind] = useState<TownKind>(startKind);
  const [template, setTemplate] = useState<TemplateId>(startTemplate ?? (startKind === "company" ? COMPANY_TEMPLATE : DEFAULT_TEMPLATE));
  const [org, setOrg] = useState<string | null>(
    orgs.find((o) => o.login === startOrg?.toLowerCase())?.login ?? orgs.find((o) => !o.joined)?.login ?? orgs[0]?.login ?? null,
  );
  const [publicOrg, setPublicOrg] = useState("");
  const [showPublic, setShowPublic] = useState(false);
  const company = kind === "company";
  const picked = company ? (orgs.find((o) => o.login === org) ?? null) : null;
  // The org already has a town: you join that one, the city is already built.
  const existing = picked?.league ?? null;
  // Company tab before there's an org to build for: only the way to get one shows.
  const noOrg = company && !picked;
  const [name, setName] = useState(startName ?? (viewer ? `${viewer.login}'s Town` : "My Town"));
  const [showSettings, setShowSettings] = useState(true);
  // Settings follow the template until you change one.
  const [scoring, setScoring] = useState<ScoringMode | null>(null);
  const [join, setJoin] = useState<JoinMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(verifyFailed ? "GitHub sign-in failed. Try again." : null);
  const t = templateFor(template);

  const starter = useMemo(() => {
    const st = starterOps(viewer ? [{ developer_id: viewer.id, weight: 0 }] : [], template);
    return { h: st.h, objects: starterObjects(st) };
  }, [template, viewer]);
  // An org's town that already exists: its real streets (buildings need its members' data, so they stay out).
  const [real, setReal] = useState<{ slug: string; h: number; objects: CityObject[] } | null>(null);
  useEffect(() => {
    if (!existing) return;
    let stop = false;
    fetch(`/api/leagues/${existing.slug}/city`)
      .then((r) => (r.ok ? (r.json() as Promise<LeagueCity>) : null))
      .then((c) => {
        if (c && !stop) setReal({ slug: existing.slug, h: c.h, objects: c.objects.filter((o) => o.kind === "item") });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [existing]);
  const city = existing ? (real?.slug === existing.slug ? real : { h: starter.h, objects: [] }) : starter;

  const byDevId = useMemo(() => {
    const devs = cityDevs as unknown as DeveloperRecord[];
    const layout = generateCityLayout(devs, undefined, cityNorms);
    const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
    const map = new Map<number, CityBuilding>();
    for (const d of devs) {
      const b = byLogin.get(d.github_login.toLowerCase());
      if (b) map.set(d.id, b);
    }
    return scaleTownHeights(map);
  }, [cityDevs, cityNorms]);
  const buildings = useMemo(() => leagueBuildings(city.objects, byDevId), [city.objects, byDevId]);

  function switchKind(k: TownKind) {
    if (k === kind) return;
    setKind(k);
    setTemplate(k === "company" ? COMPANY_TEMPLATE : DEFAULT_TEMPLATE);
    setScoring(null);
    setJoin(null);
    setError(null);
  }

  function pick(id: TemplateId) {
    setTemplate(id);
    setScoring(null);
    setJoin(null);
    setError(null);
  }

  // The lo-fi player would sit on the Build button: it stays out of this screen.
  useEffect(() => {
    const set = (hidden: boolean) => {
      const detail = { hidden };
      (window as unknown as Record<string, unknown>).__gcRadioMode = detail;
      window.dispatchEvent(new CustomEvent("gc:radio-mode", { detail }));
    };
    set(true);
    return () => set(false);
  }, []);

  // Wide screens: the city is centered in the space right of the panel.
  const shiftPx = PANEL_W / 2;

  // Arrow keys walk the templates when you're not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || existing || (e.target instanceof HTMLElement && e.target.closest("input, textarea"))) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = TEMPLATES.findIndex((x) => x.id === template);
      const next = TEMPLATES[(i + (e.key === "ArrowDown" ? 1 : -1) + TEMPLATES.length) % TEMPLATES.length];
      pick(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** POSTs, then pushes in and hands over to the town page (which plays its intro). */
  async function go(url: string, body: Record<string, unknown>, slugOf: (json: Record<string, unknown>) => string) {
    setBusy(true);
    setError(null);
    setLeaving(true);
    const started = Date.now();
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't create the town.");
        setLeaving(false);
        setBusy(false);
        return;
      }
      await new Promise((r) => setTimeout(r, Math.max(0, LEAVE_MS - (Date.now() - started))));
      window.location.href = `/town/${slugOf(json)}?new=1`;
    } catch {
      setError("Network error. Try again.");
      setLeaving(false);
      setBusy(false);
    }
  }

  const companyStart = { template, scoring: scoring ?? t.scoring };
  const slugOfJoin = (j: Record<string, unknown>) => String(j.slug);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!viewer) {
      setBusy(true);
      const back = company ? `/towns/new?kind=company&template=${template}` : `/towns/new?template=${template}&name=${encodeURIComponent(name)}`;
      signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(back)}`);
      return;
    }
    if (company) {
      if (!picked) {
        // Second GitHub sign-in that asks for read:org, back to this tab.
        setBusy(true);
        window.location.href = "/api/leagues/verify";
        return;
      }
      if (picked.joined && existing) {
        window.location.href = `/town/${existing.slug}`;
        return;
      }
      return go("/api/leagues/verify/join", { org: picked.login, ...companyStart }, slugOfJoin);
    }
    return go("/api/leagues", { name, template, scoring: scoring ?? t.scoring, join: join ?? t.join }, (j) =>
      String((j.league as { slug: string }).slug),
    );
  }

  function checkPublic() {
    const o = publicOrg.trim().replace(/^@/, "");
    if (!o || busy) return;
    void go("/api/leagues/verify/public", { org: o, ...companyStart }, slugOfJoin);
  }

  const nameOk = company || name.trim().length >= 2;
  const action = !viewer
    ? "Sign in to build"
    : !company
      ? "Build town"
      : !picked
        ? "Verify with GitHub"
        : picked.joined
          ? "Open town"
          : existing
            ? "Join town"
            : `Build @${picked.login} town`;
  const pending = !viewer || (company && !picked) ? "Opening GitHub" : existing ? "Joining" : "Building";

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-warm" style={{ animation: "fade-in 0.5s ease-out both" }}>
      {/* The city: the right two thirds on wide screens, the top half on phones. */}
      <div className="absolute inset-x-0 top-0 h-[48vh] lg:inset-0 lg:h-auto">
        <LeagueScene
          embedded
          h={city.h}
          identity={IDENTITY}
          name={company ? (existing?.name ?? picked?.login ?? "Your company") : name.trim() || "Your town"}
          objects={city.objects}
          buildings={buildings}
          mode="view"
          riseKey={existing ? `org:${existing.slug}:${real?.slug ?? ""}` : template}
          push={leaving}
          framing={{ zoom: 1.3, shiftPx }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent lg:hidden" />
      </div>

      <form
        onSubmit={build}
        className="absolute inset-x-0 bottom-0 top-[44vh] flex flex-col overflow-y-auto overscroll-contain border-t-[3px] border-border bg-bg lg:inset-y-0 lg:left-0 lg:right-auto lg:top-0 lg:w-[440px] lg:border-t-0 lg:border-r-[3px]"
        style={{
          transform: leaving ? "translateX(-105%)" : undefined,
          opacity: leaving ? 0 : 1,
          transition: "transform 0.45s cubic-bezier(0.4, 0, 1, 1), opacity 0.45s ease-in",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-5 lg:pt-6">
          <Link href="/towns" className="text-xs text-muted transition-colors hover:text-cream">
            &larr; Towns
          </Link>
        </div>
        <h1 className="px-5 pt-3 text-2xl leading-none text-cream lg:pt-4 lg:text-3xl">
          New <span className="text-lime">town</span>
        </h1>
        <div role="tablist" aria-label="Kind of town" className="mx-5 mt-4 flex border-[3px] border-border">
          {(["friends", "company"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => switchKind(k)}
              className={`flex-1 px-3 py-2 text-[11px] transition-colors ${kind === k ? "bg-lime text-bg" : "text-muted hover:text-cream"}`}
            >
              {k === "friends" ? "Friends" : "Company"}
            </button>
          ))}
        </div>
        <p className="px-5 pt-3 text-xs leading-relaxed text-muted normal-case">
          {company ? "One town per GitHub org. Members join by verifying on GitHub." : "Pick a starter city. You can change everything later."}
        </p>

        {company && viewer && (
          <CompanyOrgs
            orgs={orgs}
            org={org}
            onPick={(o) => {
              setOrg(o);
              setError(null);
            }}
            busy={busy}
            showPublic={showPublic}
            onShowPublic={() => setShowPublic(true)}
            publicOrg={publicOrg}
            onPublicOrg={setPublicOrg}
            onCheckPublic={checkPublic}
          />
        )}

        {noOrg ? null : existing ? (
          <p className="mx-5 mt-4 border-[3px] border-border bg-bg-card px-3 py-3 text-[11px] leading-relaxed text-muted normal-case">
            <span className="text-cream">{existing.name}</span> is already built.{" "}
            {picked?.joined ? "You live there." : "Join and your building moves in."}
          </p>
        ) : (
          /* Templates: a column on wide screens, a swipe row on phones. */
          <div
            role="radiogroup"
            aria-label="Starter city"
            className="mt-4 flex shrink-0 gap-2 overflow-x-auto px-5 pb-1 lg:flex-col lg:overflow-x-visible"
          >
            {TEMPLATES.map((x) => {
              const on = x.id === template;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(x.id)}
                  className={`btn-press flex w-44 shrink-0 items-start gap-3 border-[3px] px-3 py-3 text-left lg:items-center lg:py-2 transition-colors lg:w-auto ${
                    on ? "border-lime bg-bg-raised" : "border-border bg-bg-card hover:border-muted"
                  }`}
                >
                  <MiniMap id={x.id} on={on} />
                  <span className="min-w-0">
                    <span className={`block text-xs ${on ? "text-lime" : "text-cream"}`}>{x.name}</span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted normal-case">{x.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3 border-t-[3px] border-border px-5 pt-4 lg:mt-5">
          {!company && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                disabled={busy}
                aria-label="Town name"
                {...NO_AUTOFILL}
                className="border-[3px] border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-sm"
              />
            </label>
          )}

          {!existing && !noOrg && (
            <>
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                aria-expanded={showSettings}
                className="flex items-center justify-between text-[11px] text-muted transition-colors hover:text-cream"
              >
                <span>Settings {showSettings ? "▾" : "▸"}</span>
                {!showSettings && (
                  <span className="text-dim normal-case">
                    {SCORING_LABEL[scoring ?? t.scoring]} · {company ? "Verified members" : JOIN_LABEL[join ?? t.join]}
                  </span>
                )}
              </button>
              {showSettings && (
                <div className="flex flex-col gap-3">
                  <Choice
                    label="Weekly race by"
                    options={(["xp", "contributions"] as const).map((m) => ({ value: m, label: SCORING_LABEL[m] }))}
                    value={scoring ?? t.scoring}
                    onChange={setScoring}
                  />
                  {company ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-muted">Who can join</span>
                      <p className="text-[11px] text-cream normal-case">
                        {picked ? `Members of @${picked.login}` : "Org members"}, verified on GitHub
                      </p>
                    </div>
                  ) : (
                    <Choice
                      label="Who can join"
                      options={JOIN_MODES.map((m) => ({ value: m, label: JOIN_LABEL[m] }))}
                      value={join ?? t.join}
                      onChange={setJoin}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-[11px] text-red-400 normal-case">{error}</p>}
          {viewer && !viewer.claimed && (
            <p className="text-[11px] text-muted normal-case">Claim your building in the city first, then come back to build a town.</p>
          )}
        </div>
        {/* The one action stays in reach while the panel scrolls. */}
        <div className="sticky bottom-0 bg-bg px-5 pt-3 pb-4">
          <button
            type="submit"
            disabled={busy || !nameOk || (!!viewer && !viewer.claimed)}
            className="btn-press w-full bg-lime px-4 py-3 text-sm tracking-widest text-bg disabled:opacity-40"
          >
            {busy ? <Pending label={pending} /> : action}
          </button>
        </div>
      </form>
    </main>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`btn-press flex-1 border-[3px] px-2 py-2 text-[11px] ${o.value === value ? "border-lime text-lime" : "border-border text-muted hover:text-cream"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const MINI_LOT = 3;

/** The template's starter city from above, one pixel block per lot: streets, plazas, trees, toys. */
function MiniMap({ id, on }: { id: TemplateId; on: boolean }) {
  const cells = useMemo(() => {
    const city = starterOps([], id);
    const objects = starterObjects(city);
    return { h: city.h, objects };
  }, [id]);
  const b = bounds(cells.h);
  const w = (b.x1 - b.x0 + 1) * MINI_LOT;
  const d = (b.z1 - b.z0 + 1) * MINI_LOT;
  const at = (x: number, z: number) => [(x - b.x0) * MINI_LOT, (z - b.z0) * MINI_LOT] as const;
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${d}`} width={44} height={Math.round((44 * d) / w)} shapeRendering="crispEdges" className="shrink-0">
      <rect width={w} height={d} fill={on ? "#1c2a14" : "#1a1f2a"} />
      {cells.objects.map((o) => {
        if (o.px === null) {
          if (o.kind !== "item") return null;
          const [x, y] = at(o.x, o.z);
          return (
            <rect
              key={o.id}
              x={x}
              y={y}
              width={MINI_LOT}
              height={MINI_LOT}
              fill={o.item_type === "road" ? (on ? "#c8e64a" : "#9aa3b5") : "#5d6478"}
            />
          );
        }
        if (!o.item_type || o.item_type === "portal" || o.item_type === "lamp" || o.item_type === "bench") return null;
        const [x, y] = at(o.px / LOT, (o.pz ?? 0) / LOT);
        const tree = o.item_type.startsWith("tree_");
        return (
          <rect
            key={o.id}
            x={x + 0.5}
            y={y + 0.5}
            width={2}
            height={2}
            fill={tree ? "#3f9a4a" : o.item_type === "fountain" ? "#5ab0e0" : "#ff9a3c"}
          />
        );
      })}
    </svg>
  );
}

/** Your verified orgs to pick from, and the public-membership check for orgs that block OAuth apps. */
function CompanyOrgs({
  orgs,
  org,
  onPick,
  busy,
  showPublic,
  onShowPublic,
  publicOrg,
  onPublicOrg,
  onCheckPublic,
}: {
  orgs: OrgState[];
  org: string | null;
  onPick: (org: string) => void;
  busy: boolean;
  showPublic: boolean;
  onShowPublic: () => void;
  publicOrg: string;
  onPublicOrg: (v: string) => void;
  onCheckPublic: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 px-5">
      {orgs.length > 0 && (
        <div role="radiogroup" aria-label="Your GitHub org" className="flex flex-col gap-1.5">
          {orgs.map((o) => {
            const on = o.login === org;
            return (
              <button
                key={o.login}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(o.login)}
                className={`btn-press flex items-center gap-3 border-[3px] px-3 py-2 text-left transition-colors ${
                  on ? "border-lime bg-bg-raised" : "border-border bg-bg-card hover:border-muted"
                }`}
              >
                {o.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.avatar_url} alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
                ) : (
                  <span className="h-6 w-6 shrink-0 bg-bg-raised" />
                )}
                <span className={`min-w-0 flex-1 truncate text-xs normal-case ${on ? "text-lime" : "text-cream"}`}>@{o.login}</span>
                <span className="shrink-0 text-[10px] text-muted">{o.league ? (o.joined ? "You're in" : "Town exists") : "No town yet"}</span>
              </button>
            );
          })}
        </div>
      )}
      {orgs.length === 0 && (
        <p className="border-[3px] border-border bg-bg-card px-3 py-3 text-[11px] leading-relaxed text-muted normal-case">
          <span className="text-cream">First, show us your orgs.</span> GitHub asks you to share your org list. We read it once and never store your
          token.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 text-[10px]">
        {orgs.length > 0 ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, full navigation
          <a href="/api/leagues/verify" className="text-muted transition-colors hover:text-cream">
            Check my orgs again
          </a>
        ) : (
          <span />
        )}
        {!showPublic && (
          <button type="button" onClick={onShowPublic} className="shrink-0 text-muted transition-colors hover:text-cream">
            Org not listed?
          </button>
        )}
      </div>
      {showPublic && (
        <div className="flex flex-col gap-1.5 border-t-2 border-border pt-3">
          <p className="text-[10px] leading-relaxed text-muted normal-case">
            Some orgs block apps. Make your membership public on GitHub (org → People → your name → Public), then check it here.
          </p>
          <div className="flex gap-2">
            <input
              value={publicOrg}
              onChange={(e) => onPublicOrg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCheckPublic();
                }
              }}
              placeholder="org name, e.g. vercel"
              aria-label="GitHub org"
              {...NO_AUTOFILL}
              autoCapitalize="off"
              spellCheck={false}
              className="min-w-0 flex-1 border-[3px] border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-xs"
            />
            <button
              type="button"
              onClick={onCheckPublic}
              disabled={busy || !publicOrg.trim()}
              className="btn-press border-[3px] border-border px-3 py-2 text-[10px] text-cream disabled:opacity-40"
            >
              Check
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
