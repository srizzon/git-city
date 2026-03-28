import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase-server";
import JobBoardClient from "./JobBoardClient";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Jobs - Git City",
  description: "Real devs. Real jobs. No robots in between. Browse verified remote developer jobs on Git City.",
};

async function getPreviewJobs() {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("job_listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  return { total: count ?? 0 };
}

export default async function JobsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const username = (user.user_metadata?.user_name ?? user.user_metadata?.preferred_username ?? "") as string;
    return <Suspense><JobBoardClient username={username} /></Suspense>;
  }

  // Unauthenticated
  const { total } = await getPreviewJobs();

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <h1 className="text-3xl text-lime sm:text-4xl">Git City Jobs</h1>
        <p className="text-xs text-muted normal-case">
          Real devs. Real jobs. No robots in between.
        </p>
        {total > 0 && (
          <p className="text-2xl text-lime">
            {total} open position{total !== 1 ? "s" : ""}
          </p>
        )}
        <p className="text-xs text-muted normal-case">
          Sign in with GitHub to browse listings and apply.
        </p>
        <Link
          href="/api/auth/github?redirect=/jobs"
          className="btn-press inline-block bg-lime px-8 py-4 text-sm text-bg"
          style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
        >
          Sign in with GitHub
        </Link>
        <p className="text-xs text-dim normal-case">
          Hiring? <Link href="/for-companies" className="text-lime transition-colors hover:text-cream">Post a job</Link>
        </p>
      </div>
    </main>
  );
}
