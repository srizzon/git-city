import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase-server";
import { CLAIMED_DEVELOPER_LIMIT, githubLoginFromIdentity, pickClaimedDeveloper } from "@/lib/auth-identity";
import JobBoardClient from "./JobBoardClient";

export const metadata: Metadata = {
  title: "Developer Jobs - Git City",
  description: "Real devs. Real jobs. No robots in between. Browse verified remote developer jobs with transparent salaries on Git City.",
  openGraph: {
    title: "Developer Jobs - Git City",
    description: "Real devs. Real jobs. No robots in between. Browse verified remote developer jobs with transparent salaries.",
  },
};

export default async function JobsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const username = user
    ? githubLoginFromIdentity(user)
    : null;

  let hasProfile = false;
  if (user) {
    const { data: devRows } = await supabase
      .from("developers")
      .select("id, github_login")
      .eq("claimed_by", user.id)
      .order("claimed_at", { ascending: true })
      .limit(CLAIMED_DEVELOPER_LIMIT);
    const dev = pickClaimedDeveloper(devRows, user);
    if (dev) {
      const { count } = await supabase
        .from("career_profiles")
        .select("id", { count: "exact", head: true })
        .eq("id", dev.id);
      hasProfile = (count ?? 0) > 0;
    }
  }

  return <Suspense><JobBoardClient username={username} hasProfile={hasProfile} /></Suspense>;
}
