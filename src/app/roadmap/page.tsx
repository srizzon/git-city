import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import RoadmapClient from "./RoadmapClient";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Roadmap - Git City",
  description:
    "See what's coming next for Git City. Vote on the features you want most.",
};

export default async function RoadmapPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <RoadmapClient voteCounts={{}} userVotes={[]} isLoggedIn={false} />;
  }

  const admin = getSupabaseAdmin();

  // Fetch vote counts per item
  const { data: voteCounts } = await admin
    .from("roadmap_votes")
    .select("item_id")
    .then(({ data }: { data: { item_id: string }[] | null }) => {
      // Aggregate counts manually since Supabase JS doesn't support GROUP BY directly
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.item_id] = (counts[row.item_id] ?? 0) + 1;
      }
      return { data: counts };
    });

  // Check if user is logged in and get their votes
  let userVotes: string[] = [];
  let userLogin: string | null = null;

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      userLogin =
        (
          user.user_metadata.user_name ??
          user.user_metadata.preferred_username ??
          ""
        ).toLowerCase() || null;

      if (userLogin) {
        // Get developer ID
        const { data: dev } = await admin
          .from("developers")
          .select("id")
          .eq("github_login", userLogin)
          .single();

        if (dev) {
          const { data: votes } = await admin
            .from("roadmap_votes")
            .select("item_id")
            .eq("developer_id", dev.id);

          userVotes = (votes ?? []).map((v: { item_id: string }) => v.item_id);
        }
      }
    }
  } catch {
    // Not logged in, that's fine
  }

  return (
    <RoadmapClient
      voteCounts={voteCounts ?? {}}
      userVotes={userVotes}
      isLoggedIn={!!userLogin}
    />
  );
}
