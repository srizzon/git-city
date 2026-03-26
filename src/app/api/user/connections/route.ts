import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchFollowers, fetchFollowing } from "@/lib/github-api";

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const githubLogin = (
        user.user_metadata.user_name ??
        user.user_metadata.preferred_username ??
        ""
    ).toLowerCase();

    if (!githubLogin) {
        return NextResponse.json({ error: "No GitHub login found in session" }, { status: 400 });
    }

    try {
        // Fetch followers and following from GitHub in parallel
        const [followers, following] = await Promise.all([
            fetchFollowers(githubLogin),
            fetchFollowing(githubLogin),
        ]);

        const uniqueLogins = Array.from(new Set([...followers, ...following]));

        if (uniqueLogins.length === 0) {
            return NextResponse.json({ connections: [] });
        }

        const admin = getSupabaseAdmin();

        // Query the database to see which of these users are already in Git City
        const { data: devs, error } = await admin
            .from("developers")
            .select("id, github_login, name, avatar_url, contributions, total_stars, public_repos, primary_language, rank, claimed, kudos_count, visit_count, contributions_total, contribution_years, total_prs, total_reviews, repos_contributed_to, followers, following, organizations_count, account_created_at, current_streak, active_days_last_year, language_diversity, app_streak, rabbit_completed, district, district_chosen, xp_total, xp_level")
            .in("github_login", uniqueLogins);

        if (error) {
            console.error("Error fetching connections from DB:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ connections: devs ?? [] });
    } catch (err) {
        console.error("Error in connections API:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
