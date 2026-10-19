import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCityDevsByIds, getCityNorms } from "@/lib/leagues/queries";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG, getBrasilState } from "@/lib/towns/brasil-server";
import { BrasilMap, capitalIbge, layoutBrasil, layoutFromState, type UF } from "@/lib/towns/brasil-map";
import { readReel } from "@/lib/reel/home";
import { filled } from "@/lib/reel/spec";
import { getLeagueCityDevs, getLeagueMembers } from "@/lib/leagues/queries";
import { getCachedCity } from "@/lib/league-city/service";
import { townDisplayName } from "@/lib/towns/names";
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
  if (world.type === "bay") return <ReelStudioLoader spec={spec} words={files.words} song={files.song} brasil={null} towns={null} />;
  if (world.type === "towns") {
    const loaded = await Promise.all(
      Object.entries(world.towns).map(async ([stage, slug]) => {
        const league = await getLeagueBySlug(slug);
        if (!league) return null;
        const [members, city] = await Promise.all([getLeagueMembers(league.id), getCachedCity(league.id)]);
        return { stage, name: townDisplayName(league.name), city, cityDevs: await getLeagueCityDevs(members) };
      }),
    );
    if (loaded.some((t) => !t)) return <main className="p-6 font-pixel text-xs text-muted">A town in the spec doesn&apos;t exist.</main>;
    return <ReelStudioLoader spec={spec} words={files.words} song={files.song} brasil={null} towns={{ towns: loaded.filter((t) => !!t), norms: await getCityNorms() }} />;
  }
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) notFound();
  // The map as it's stored now (asOf no longer applies: the map grows and moves its cities), or empty (Dia 1).
  const state = world.residents === "none" ? null : await getBrasilState(league.id);
  const layout = state ? layoutFromState(state) : layoutBrasil([]);
  // The example building: on the lot its state's next dev would get in the capital (placed on a copy of the map).
  let exampleLot: [number, number] | null = null;
  if (world.example) {
    const dev = { id: -1, login: world.example.login, uf: world.example.uf.toUpperCase() as UF };
    const withIt = state
      ? (() => {
          const map = new BrasilMap(structuredClone({ scale: state.scale, cities: state.cities, residents: state.residents }));
          // Arriving after everyone already there.
          map.place(dev, capitalIbge(dev.uf), state.residents.reduce((m, r) => Math.max(m, r.at), 0) + 1);
          return map.layout();
        })()
      : layoutBrasil([dev]);
    const lot = [...withIt.cities, withIt.island].flatMap((c) => c.devs).find((d) => d.dev.id === -1);
    exampleLot = lot ? [lot.x, lot.z] : null;
  }
  const sb = getSupabaseAdmin();
  const { data: ex, error } = world.example
    ? await sb.from("developers").select("id").eq("github_login", world.example.login.toLowerCase()).maybeSingle<{ id: number }>()
    : { data: null, error: null };
  if (error) throw new Error(`The example building (${world.example?.login}): ${error.message}`);
  const [cityDevs, exampleDevs, norms] = await Promise.all([
    getCityDevsByIds((state?.residents ?? []).map((r) => r.dev.id)),
    getCityDevsByIds(ex ? [ex.id] : []),
    getCityNorms(),
  ]);
  return (
    <ReelStudioLoader
      spec={spec}
      words={files.words}
      song={files.song}
      brasil={{ layout, cityDevs, example: exampleDevs[0] ?? null, exampleLot, norms }}
      towns={null}
    />
  );
}
