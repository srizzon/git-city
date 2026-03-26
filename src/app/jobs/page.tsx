import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import JobBoardClient from "./JobBoardClient";

export const metadata: Metadata = {
  title: "Jobs - Git City",
  description: "Real devs. Real jobs. No robots in between. Browse verified remote developer jobs on Git City.",
};

async function getJobCount() {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("job_listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  return count ?? 0;
}

export default async function JobsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const jobCount = await getJobCount();
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-3 py-6 sm:px-4 sm:py-10">
          <div className="w-full border-[3px] border-border bg-bg-raised p-6 sm:p-10 text-center space-y-6">
            <h1 className="text-3xl text-lime sm:text-4xl">
              Git City Jobs
            </h1>
            <p className="text-sm text-cream-dark normal-case">
              Real devs. Real jobs. No robots in between.
            </p>
            {jobCount > 0 ? (
              <p className="text-2xl text-lime">
                {jobCount} open position{jobCount !== 1 ? "s" : ""}
              </p>
            ) : (
              <p className="text-sm text-muted">Jobs launching soon.</p>
            )}
            <p className="text-xs text-muted normal-case">
              Join Git City to see listings, apply, and create your Career Profile.
            </p>
            <Link
              href="/api/auth/github"
              className="btn-press inline-block border-[3px] border-lime bg-lime px-6 py-3 text-sm text-bg"
              style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}
            >
              Sign in with GitHub
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <JobBoardClient />;
}
