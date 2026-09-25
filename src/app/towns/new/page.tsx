import type { Metadata } from "next";
import { getViewer } from "@/lib/leagues/service";
import { getCityNorms, getLeagueCityDevs, type LeagueMemberRow } from "@/lib/leagues/queries";
import { isTemplateId } from "@/lib/league-city/templates";
import { loadOrgStates } from "@/lib/towns/company-orgs";
import NewTown from "./new-town";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New town - Git City",
  description: "Pick a starter city and build your friends' or your company's town in Git City.",
  robots: { index: false, follow: false },
};

type Search = { template?: string; name?: string; kind?: string; org?: string; error?: string };

export default async function NewTownPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { template, name, kind, org, error } = await searchParams;
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
  const [cityDevs, cityNorms, orgs] = await Promise.all([
    me ? getLeagueCityDevs([me]).catch(() => []) : Promise.resolve([]),
    getCityNorms(),
    viewer ? loadOrgStates(viewer.id).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <NewTown
      viewer={viewer ? { id: viewer.id, login: viewer.github_login, claimed: viewer.claimed } : null}
      cityDevs={cityDevs}
      cityNorms={cityNorms}
      startKind={kind === "company" ? "company" : "friends"}
      startTemplate={isTemplateId(template) ? template : null}
      startName={typeof name === "string" ? name.slice(0, 40) : null}
      orgs={orgs}
      startOrg={typeof org === "string" ? org : null}
      verifyFailed={!!error}
    />
  );
}
