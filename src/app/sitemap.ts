import type { MetadataRoute } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let developers: { github_login: string; updated_at: string | null }[] = [];
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("developers")
      .select("github_login, updated_at")
      .order("rank", { ascending: true, nullsFirst: false });
    developers = data ?? [];
  }

  const devEntries: MetadataRoute.Sitemap = (developers ?? []).map((dev) => ({
    url: `${BASE_URL}/dev/${dev.github_login}`,
    lastModified: dev.updated_at ?? undefined,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [
    {
      url: BASE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/leaderboard`,
      changeFrequency: "hourly",
      priority: 0.8,
    },
    ...devEntries,
  ];
}
