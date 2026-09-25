import type { Metadata } from "next";
import { getViewer } from "@/lib/leagues/service";
import { getCityNorms, getLeagueCityDevs, type LeagueMemberRow } from "@/lib/leagues/queries";
import { DEFAULT_TEMPLATE, isTemplateId } from "@/lib/league-city/templates";
import NewTown from "./new-town";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New town - Git City",
  description: "Pick a starter city, name it, and build your group's town in Git City.",
  robots: { index: false, follow: false },
};

export default async function NewTownPage({ searchParams }: { searchParams: Promise<{ template?: string; name?: string }> }) {
  const { template, name } = await searchParams;
  const viewer = await getViewer();

  // The preview shows your own building on its lot.
  const me: LeagueMemberRow | null = viewer
    ? {
        developer_id: viewer.id,
        login: viewer.github_login,
        name: null,
        avatar_url: null,
        status: "active",
        verification: null,
        contributions: 0,
        joined_at: null,
        invited_by: null,
      }
    : null;
  const [cityDevs, cityNorms] = await Promise.all([me ? getLeagueCityDevs([me]).catch(() => []) : Promise.resolve([]), getCityNorms()]);

  return (
    <NewTown
      viewer={viewer ? { id: viewer.id, login: viewer.github_login, claimed: viewer.claimed } : null}
      cityDevs={cityDevs}
      cityNorms={cityNorms}
      startTemplate={isTemplateId(template) ? template : DEFAULT_TEMPLATE}
      startName={typeof name === "string" ? name.slice(0, 40) : null}
    />
  );
}
