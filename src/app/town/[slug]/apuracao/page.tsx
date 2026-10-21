import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, pickLang } from "@/lib/i18n/lang";
import { LangProvider } from "@/lib/i18n/LangProvider";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getCount } from "@/lib/towns/brasil-election-server";
import { PRESIDENCY_ON } from "@/lib/towns/brasil-election";
import ApuracaoLive from "@/components/towns/brasil/ApuracaoLive";

// The presidential vote's live count (apuração): its own page, so it can be
// left open, shared, and filmed for the reels. Only while the presidency is on.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = "Apuração · presidente do Brasil dos devs · Git City";
  const description = "A contagem ao vivo dos votos pra presidente do mapa dos devs.";
  const image = { url: `/town/${slug}/brasil-og`, width: 1200, height: 630, alt: "The Brasil map in Git City" };
  return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

export default async function ApuracaoPage({ params }: Props) {
  if (!PRESIDENCY_ON) notFound();
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (league?.map !== "brasil") notFound();
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const lang = pickLang({ cookie: jar.get(LANG_COOKIE)?.value, acceptLanguage: h.get("accept-language"), country: h.get("x-vercel-ip-country") });
  return (
    <LangProvider initial={lang}>
      <ApuracaoLive slug={league.slug} initial={await getCount(league.id)} />
    </LangProvider>
  );
}
