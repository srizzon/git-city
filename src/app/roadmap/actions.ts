"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";
import { VOTABLE_ITEM_IDS } from "@/lib/roadmap-data";

export async function toggleVote(itemId: string) {
  // Validate item ID against hardcoded list
  if (!VOTABLE_ITEM_IDS.has(itemId)) {
    throw new Error("Invalid item ID");
  }

  // Authenticate user
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const admin = getSupabaseAdmin();

  // Get developer ID
  const { data: devRows } = await admin
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const dev = pickClaimedDeveloper(devRows, user);

  if (!dev) {
    throw new Error("Developer not found");
  }

  // Check if vote exists
  const { data: existing } = await admin
    .from("roadmap_votes")
    .select("id")
    .eq("developer_id", dev.id)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existing) {
    // Remove vote
    await admin.from("roadmap_votes").delete().eq("id", existing.id);
  } else {
    // Add vote (ON CONFLICT DO NOTHING for safety)
    await admin.from("roadmap_votes").insert({
      developer_id: dev.id,
      item_id: itemId,
    });
  }

  revalidatePath("/roadmap");
}
