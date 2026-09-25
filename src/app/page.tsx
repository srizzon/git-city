import { createServerSupabase } from "@/lib/supabase-server";
import { githubLoginFromIdentity, isAdminUser } from "@/lib/auth-identity";
import { getActivePool } from "@/lib/landmarks/repository";
import { chooseLandmarks, computeSeed } from "@/lib/landmarks/selection";
import { preload } from "react-dom";
import { snapshotUrl } from "@/lib/city-snapshot-client";
import { SNAPSHOT_V2_PATH } from "@/lib/city-snapshot-format";
import HomeClient from "./_components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ landmark?: string | string[] }>;
}) {
  // The city data is the critical path: start both downloads from the HTML
  // head so they run while the JS bundle is still loading.
  preload(snapshotUrl(SNAPSHOT_V2_PATH), { as: "fetch", crossOrigin: "anonymous" });
  preload("/maps/bay.json", { as: "fetch", crossOrigin: "anonymous" });

  const [pool, sb, sp] = await Promise.all([
    getActivePool(),
    createServerSupabase(),
    searchParams,
  ]);

  const { data: { user } } = await sb.auth.getUser();
  const login = githubLoginFromIdentity(user) || null;

  const landmarkParam = Array.isArray(sp.landmark) ? sp.landmark[0] : sp.landmark;

  const seed = computeSeed(login);
  const assignments = chooseLandmarks(pool, seed, login, {
    forceIncludeSlug: landmarkParam,
  });

  return <HomeClient assignments={assignments} isAdmin={isAdminUser(user)} />;
}
