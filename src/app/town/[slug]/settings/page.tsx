import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getLeagueBySlug, getOrCreateInviteToken, getViewer, listJoinRequests, openInviteLink } from "@/lib/leagues/service";
import { getLeagueMembers } from "@/lib/leagues/queries";
import SettingsClient from "./settings-client";
import { townDisplayName } from "@/lib/towns/names";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  return { title: league ? `${townDisplayName(league.name)} settings - Git City` : "Town not found - Git City", robots: { index: false } };
}

export default async function LeagueSettingsPage({ params }: Props) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const viewer = await getViewer();
  if (!viewer || league.admin_id !== viewer.id) redirect(`/town/${league.slug}`);

  const members = (await getLeagueMembers(league.id)).filter((m) => m.status !== "former");
  // Older leagues get their token on this first admin visit.
  let inviteLink: string | null = null;
  if (league.kind === "custom") {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const origin = process.env.PORTLESS_URL ?? (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : undefined);
    inviteLink = openInviteLink(league.slug, viewer.github_login, await getOrCreateInviteToken(viewer, league), origin);
  }
  const requests = league.kind === "custom" ? await listJoinRequests(viewer, league) : [];
  return (
    <SettingsClient
      league={league}
      members={members}
      viewerLogin={viewer.github_login}
      inviteLink={inviteLink}
      requests={requests}
    />
  );
}
