import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { currentAd, listProjects } from "@/lib/towns/brasil-projects-server";
import ProjectsBoard from "@/components/towns/brasil/ProjectsBoard";

// Every project on the Brasil map: this week's ranking (the one that wins
// points), the newest, the all-time list and the past winners, to upvote from.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = "Projetos dos devs do Brasil · Git City";
  const description = "O que os devs do mapa construíram. Vota nos teus favoritos: os três mais votados da semana ganham pontos.";
  const image = { url: `/town/${slug}/brasil-og`, width: 1200, height: 630, alt: "The Brasil map in Git City" };
  return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

export default async function ProjectsPage({ params }: Props) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (league?.map !== "brasil") notFound();
  const viewer = await getViewer();
  const [initial, ad] = await Promise.all([listProjects(league.id, { tab: "week", viewerId: viewer?.id ?? null }), currentAd(league.id)]);
  return <ProjectsBoard slug={league.slug} initial={initial} ad={ad} viewerLogin={viewer?.github_login ?? null} />;
}
