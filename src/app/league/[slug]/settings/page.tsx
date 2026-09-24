import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { getLeagueMembers } from "@/lib/leagues/queries";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  return { title: league ? `${league.name} settings - Git City` : "League not found - Git City", robots: { index: false } };
}

export default async function LeagueSettingsPage({ params }: Props) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const viewer = await getViewer();
  if (!viewer || league.admin_id !== viewer.id) redirect(`/league/${league.slug}`);

  const members = (await getLeagueMembers(league.id)).filter((m) => m.status !== "former");
  return <SettingsClient league={league} members={members} viewerLogin={viewer.github_login} />;
}
