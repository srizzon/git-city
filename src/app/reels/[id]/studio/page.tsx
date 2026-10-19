import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCityDevsByIds, getCityNorms } from "@/lib/leagues/queries";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG, getBrasilResidents } from "@/lib/towns/brasil-server";
import { readReel } from "@/lib/reel/home";
import { filled } from "@/lib/reel/spec";
import ReelStudioLoader from "./loader";

// A reel from REELS_HOME played live in its world, in the trailer kit's
// studio (9:16; the export opens it with ?export). Dev only.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reel studio - Git City",
  robots: { index: false, follow: false },
};

export default async function ReelStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const files = readReel(id);
  if (!files) notFound();
  const spec = filled(files.spec);
  if (!files.words)
    return <main className="flex min-h-screen items-center justify-center bg-black font-pixel text-xs text-muted">No voice yet: run `npm run reel draft {id}`.</main>;

  const world = spec.world;
  // The home city loads its snapshot in the browser, as the home page does.
  if (world.type === "bay") return <ReelStudioLoader spec={spec} words={files.words} song={files.song} brasil={null} />;
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) notFound();
  // Without an asOf, the map as it is now.
  const asOf = world.asOf ? Date.parse(world.asOf) : Infinity;
  const residents = world.residents === "none" ? [] : (await getBrasilResidents(league.id)).filter((r) => r.at <= asOf);
  const sb = getSupabaseAdmin();
  const { data: ex, error } = world.example
    ? await sb.from("developers").select("id").eq("github_login", world.example.login.toLowerCase()).maybeSingle<{ id: number }>()
    : { data: null, error: null };
  if (error) throw new Error(`The example building (${world.example?.login}): ${error.message}`);
  const [cityDevs, exampleDevs, norms] = await Promise.all([
    getCityDevsByIds(residents.map((r) => r.dev.id)),
    getCityDevsByIds(ex ? [ex.id] : []),
    getCityNorms(),
  ]);
  return (
    <ReelStudioLoader
      spec={spec}
      words={files.words}
      song={files.song}
      brasil={{ residents, cityDevs, example: exampleDevs[0] ?? null, norms }}
    />
  );
}
