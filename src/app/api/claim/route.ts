import { NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, getAuthIdentity, pickClaimedDeveloper } from "@/lib/auth-identity";
import { seedSocialLinksFromGithub } from "@/lib/social-links-server";

export async function POST() {
  const identity = await getAuthIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The login comes from the GitHub identity GoTrue wrote, not user_metadata,
  // so a user can't claim someone else's building by renaming themselves.
  const { user, login: githubLogin } = identity;

  if (!githubLogin) {
    return NextResponse.json(
      { error: "No GitHub username in profile" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // Check that the user hasn't already claimed a different building
  const { data: alreadyClaimedRows } = await admin
    .from("developers")
    .select("github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const alreadyClaimed = pickClaimedDeveloper(alreadyClaimedRows, user);

  if (alreadyClaimed) {
    return NextResponse.json(
      { error: "You have already claimed a building" },
      { status: 409 }
    );
  }

  // Atomic claim: eq("claimed", false) + is("claimed_by", null) prevents race conditions
  const { data, error } = await admin
    .from("developers")
    .update({
      claimed: true,
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
      fetch_priority: 1,
    })
    .eq("github_login", githubLogin)
    .eq("claimed", false)
    .is("claimed_by", null)
    .select("github_login")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Building not found or already claimed" },
      { status: 404 }
    );
  }

  // Insert feed event
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (dev) {
    await admin.from("activity_feed").insert({
      event_type: "building_claimed",
      actor_id: dev.id,
      metadata: { login: githubLogin },
    });

    // Auto-fill social links (twitter/blog) from the public GitHub profile.
    // Fire-and-forget after the response — never slows or breaks the claim.
    after(() => seedSocialLinksFromGithub(dev.id, githubLogin));
  }

  return NextResponse.json({ claimed: true, github_login: data.github_login });
}
