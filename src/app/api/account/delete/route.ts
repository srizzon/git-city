import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Find the developer record claimed by this auth user
  const { data: dev, error: devErr } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (devErr || !dev) {
    // No claimed building — just delete the auth user
    await admin.auth.admin.deleteUser(user.id);
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  }

  const devId = dev.id;

  // Delete personal data in dependency order
  await Promise.all([
    admin.from("activity_feed").delete().or(`actor_id.eq.${devId},target_id.eq.${devId}`),
    admin.from("xp_log").delete().eq("developer_id", devId),
    admin.from("daily_mission_progress").delete().eq("developer_id", devId),
    admin.from("fly_scores").delete().eq("developer_id", devId),
    admin.from("streak_freeze_log").delete().eq("developer_id", devId),
    admin.from("streak_checkins").delete().eq("developer_id", devId),
    admin.from("developer_kudos").delete().or(`giver_id.eq.${devId},receiver_id.eq.${devId}`),
    admin.from("building_visits").delete().or(`visitor_id.eq.${devId},building_id.eq.${devId}`),
    admin.from("developer_achievements").delete().eq("developer_id", devId),
    admin.from("developer_customizations").delete().eq("developer_id", devId),
    admin.from("purchases").delete().eq("developer_id", devId),
    admin.from("notification_preferences").delete().eq("developer_id", devId),
    admin.from("notification_log").delete().eq("developer_id", devId),
    admin.from("notification_batches").delete().eq("developer_id", devId),
    admin.from("push_subscriptions").delete().eq("developer_id", devId),
  ]);

  // Null out gifted_to references from other users' purchases pointing to this dev
  await admin.from("purchases").update({ gifted_to: null }).eq("gifted_to", devId);

  // Raids: delete tags first, then raids themselves
  await admin.from("raid_tags").delete().or(`building_id.eq.${devId},attacker_id.eq.${devId}`);
  await admin.from("raids").delete().or(`attacker_id.eq.${devId},defender_id.eq.${devId}`);

  // Delete the developer row (removes the building from the city entirely)
  await admin.from("developers").delete().eq("id", devId);

  // Delete the auth user
  await admin.auth.admin.deleteUser(user.id);

  // Sign out the session
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
