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
import { JOIN_LABEL, SCORING_LABEL, TEMPLATES, templateFor, type TemplateId } from "@/lib/league-city/templates";
import type { CityIdentity } from "@/lib/league-city/types";
import type { ScoringMode } from "@/lib/leagues/scoring";
import { JOIN_MODES, type JoinMode } from "@/lib/towns/joining";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), { ssr: false, loading: () => null });

const IDENTITY: CityIdentity = { sky: 1, signSide: null, logoUrl: null, logoRemoved: false, identityVersion: 0 };
/** The panel slides out and the camera pushes in before the town page takes over. */
const LEAVE_MS = 700;
/** The panel's width on wide screens (lg:w-[440px]). */
const PANEL_W = 440;

// Create a town like a game makes a world (Roblox's template gallery,
// Minecraft's Create World): the picked starter city stands live behind the
// panel, the name comes filled in, settings wait behind a toggle.
export default function NewTown({
  viewer,
  cityDevs,
  cityNorms,
  startTemplate,
  startName,
}: {
  viewer: { id: number; login: string; claimed: boolean } | null;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  startTemplate: TemplateId;
  startName: string | null;
}) {
  const [template, setTemplate] = useState<TemplateId>(startTemplate);
  const [name, setName] = useState(startName ?? (viewer ? `${viewer.login}'s Town` : "My Town"));
  const [showSettings, setShowSettings] = useState(true);
  // Settings follow the template until you change one.
  const [scoring, setScoring] = useState<ScoringMode | null>(null);
  const [join, setJoin] = useState<JoinMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = templateFor(template);

  const city = useMemo(() => {
    const starter = starterOps(viewer ? [{ developer_id: viewer.id, weight: 0 }] : [], template);
    return { h: starter.h, objects: starterObjects(starter) };
  }, [template, viewer]);

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
      if (busy || (e.target instanceof HTMLElement && e.target.closest("input, textarea"))) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = TEMPLATES.findIndex((x) => x.id === template);
      const next = TEMPLATES[(i + (e.key === "ArrowDown" ? 1 : -1) + TEMPLATES.length) % TEMPLATES.length];
      pick(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!viewer) {
      setBusy(true);
      const back = `/towns/new?template=${template}&name=${encodeURIComponent(name)}`;
      signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(back)}`);
      return;
    }
    setBusy(true);
    setError(null);
    setLeaving(true);
    const started = Date.now();
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, template, scoring: scoring ?? t.scoring, join: join ?? t.join }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't create the town.");
        setLeaving(false);
        setBusy(false);
        return;
      }
      // Let the push-in finish, then the town page takes over (and plays its intro).
      await new Promise((r) => setTimeout(r, Math.max(0, LEAVE_MS - (Date.now() - started))));
      window.location.href = `/town/${json.league.slug}?new=1`;
    } catch {
      setError("Network error. Try again.");
      setLeaving(false);
      setBusy(false);
    }
  }

  const nameOk = name.trim().length >= 2;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-warm" style={{ animation: "fade-in 0.5s ease-out both" }}>
      {/* The city: the right two thirds on wide screens, the top half on phones. */}
      <div className="absolute inset-x-0 top-0 h-[48vh] lg:inset-0 lg:h-auto">
        <LeagueScene embedded h={city.h} identity={IDENTITY} name={name.trim() || "Your town"} objects={city.objects} buildings={buildings} mode="view" riseKey={template} push={leaving} framing={{ zoom: 1.3, shiftPx }} />
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
        <p className="px-5 pt-2 text-xs leading-relaxed text-muted normal-case">Pick a starter city. You can change everything later.</p>

        {/* Templates: a column on wide screens, a swipe row on phones. */}
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

        <div className="mt-auto flex flex-col gap-3 border-t-[3px] border-border px-5 pt-4 lg:mt-5">
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

          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            aria-expanded={showSettings}
            className="flex items-center justify-between text-[11px] text-muted transition-colors hover:text-cream"
          >
            <span>Settings {showSettings ? "▾" : "▸"}</span>
            {!showSettings && (
              <span className="text-dim normal-case">
                {SCORING_LABEL[scoring ?? t.scoring]} · {JOIN_LABEL[join ?? t.join]}
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
              <Choice
                label="Who can join"
                options={JOIN_MODES.map((m) => ({ value: m, label: JOIN_LABEL[m] }))}
                value={join ?? t.join}
                onChange={setJoin}
              />
            </div>
          )}

          {error && <p className="text-[11px] text-red-400 normal-case">{error}</p>}
          {viewer && !viewer.claimed && (
            <p className="text-[11px] text-muted normal-case">
              Claim your building in the city first, then come back to build a town.
            </p>
          )}
        </div>
        {/* The one action stays in reach while the panel scrolls. */}
        <div className="sticky bottom-0 bg-bg px-5 pt-3 pb-4">
          <button
            type="submit"
            disabled={busy || !nameOk || (!!viewer && !viewer.claimed)}
            className="btn-press w-full bg-lime px-4 py-3 text-sm tracking-widest text-bg disabled:opacity-40"
          >
            {busy ? <Pending label={viewer ? "Building" : "Opening GitHub"} /> : viewer ? "Build town" : "Sign in to build"}
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
          return <rect key={o.id} x={x} y={y} width={MINI_LOT} height={MINI_LOT} fill={o.item_type === "road" ? (on ? "#c8e64a" : "#9aa3b5") : "#5d6478"} />;
        }
        if (!o.item_type || o.item_type === "portal" || o.item_type === "lamp" || o.item_type === "bench") return null;
        const [x, y] = at(o.px / LOT, (o.pz ?? 0) / LOT);
        const tree = o.item_type.startsWith("tree_");
        return <rect key={o.id} x={x + 0.5} y={y + 0.5} width={2} height={2} fill={tree ? "#3f9a4a" : o.item_type === "fountain" ? "#5ab0e0" : "#ff9a3c"} />;
      })}
    </svg>
  );
}
