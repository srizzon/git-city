"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import PixelSpinner from "@/components/leagues/PixelSpinner";
import { generateCityLayout, type CityBuilding, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import type { LeaguePageData } from "@/lib/leagues/queries";
import type { LeagueCity } from "@/lib/league-city/service";
import { leagueBuildings } from "@/lib/league-city/buildings";
import LeagueTitle from "@/components/league/hud/LeagueTitle";
import RaceWidget from "@/components/league/hud/RaceWidget";
import ActionBar from "@/components/league/hud/ActionBar";
import HallOfFamePanel from "@/components/league/hud/HallOfFamePanel";
import StandingsPanel from "@/components/league/hud/StandingsPanel";
import InvitePanel from "@/components/league/hud/InvitePanel";
import JoinPanel from "@/components/league/hud/JoinPanel";
import BuildingCard from "@/components/league/hud/BuildingCard";
import { HUD_BOX } from "@/components/league/hud/shared";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center gap-3 bg-bg font-pixel text-[10px] uppercase text-muted">
      <PixelSpinner />
      Building the city
    </div>
  ),
});

type PanelId = "hall" | "standings" | "invite" | "join" | null;

export default function LeagueClient({
  data,
  city,
  cityDevs,
  cityNorms,
  topCompanyLastWeek,
  invite,
  refLogin,
}: {
  data: LeaguePageData;
  city: LeagueCity;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  topCompanyLastWeek: boolean;
  invite: string | null;
  refLogin: string | null;
}) {
  const { league, members, viewer } = data;
  const isMember = viewer?.status === "active";
  const invitedMember = invite ? members.find((m) => m.login.toLowerCase() === invite) : undefined;
  const showJoinCta = !isMember && (!!invite || viewer?.status === "invited");
  const [panel, setPanel] = useState<PanelId>(showJoinCta ? "join" : null);
  const [focused, setFocused] = useState<CityBuilding | null>(null);

  // Building sizes come from the main city's formulas; positions from the lots.
  const buildings = useMemo(() => {
    const layout = generateCityLayout(cityDevs as unknown as DeveloperRecord[], undefined, cityNorms);
    const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
    const byDevId = new Map<number, CityBuilding>();
    for (const d of cityDevs as unknown as DeveloperRecord[]) {
      const b = byLogin.get(d.github_login.toLowerCase());
      if (b) byDevId.set(d.id, b);
    }
    return leagueBuildings(city.objects, byDevId);
  }, [city.objects, cityDevs, cityNorms]);

  const verifyHref = !isMember && !showJoinCta && viewer && league.kind === "company" ? "/leagues/verify" : null;
  const close = () => setPanel(null);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-warm">
      <LeagueScene
        size={city.size}
        objects={city.objects}
        buildings={buildings}
        focused={focused?.login ?? null}
        onBuildingClick={(b) => {
          setPanel(null);
          setFocused(b);
        }}
      />

      {/* HUD: the wrappers ignore the pointer so the city stays draggable. */}
      <div className="pointer-events-none fixed left-4 top-4 z-30">
        <LeagueTitle data={data} topCompanyLastWeek={topCompanyLastWeek} />
      </div>

      <div className={`pointer-events-none fixed right-4 top-4 z-30 hidden transition-opacity duration-200 sm:block ${focused || panel ? "opacity-0" : ""}`}>
        <RaceWidget data={data} onHallOfFame={() => setPanel("hall")} onStandings={() => setPanel("standings")} />
      </div>

      <div className={`pointer-events-none fixed inset-x-4 bottom-4 z-30 flex flex-col items-center gap-2 ${focused ? "max-sm:hidden" : ""}`}>
        <div className="pointer-events-none flex w-full items-end justify-center gap-2">
          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setPanel("standings")}
              className={`${HUD_BOX} btn-press px-3 py-2 text-[10px] text-cream`}
            >
              Race
            </button>
          </div>
          <ActionBar
            slug={league.slug}
            canInvite={isMember}
            isAdmin={!!viewer?.is_admin}
            verifyHref={verifyHref}
            onInvite={() => {
              setFocused(null);
              setPanel("invite");
            }}
          />
        </div>
      </div>

      {panel === "hall" && <HallOfFamePanel data={data} onClose={close} />}
      {panel === "standings" && <StandingsPanel data={data} onClose={close} />}
      {panel === "invite" && isMember && viewer && (
        <InvitePanel
          slug={league.slug}
          viewerLogin={viewer.login}
          pending={members.filter((m) => m.status === "invited")}
          onClose={close}
        />
      )}
      {focused && <BuildingCard key={focused.loginLower} building={focused} data={data} onClose={() => setFocused(null)} />}
      {panel === "join" && (
        <JoinPanel
          leagueSlug={league.slug}
          leagueKind={league.kind}
          signedIn={!!viewer}
          invitee={invitedMember?.login ?? invite}
          refLogin={refLogin}
          onClose={close}
        />
      )}
    </main>
  );
}
