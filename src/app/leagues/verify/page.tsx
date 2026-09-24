import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/leagues/service";
import { VERIFICATION_DAYS } from "@/lib/leagues/verification";
import VerifyClient, { type OrgState } from "./verify-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify your company - Git City",
  robots: { index: false },
};

async function loadOrgStates(devId: number): Promise<{ orgs: OrgState[]; verifiedOnce: boolean }> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - VERIFICATION_DAYS * 86_400_000).toISOString();
  const { data: rows } = await sb
    .from("developer_orgs")
    .select("org_login, avatar_url")
    .eq("developer_id", devId)
    .gte("verified_at", since)
    .order("org_login");

  const logins = (rows ?? []).map((r) => r.org_login as string);
  const { data: leagues } = logins.length
    ? await sb.from("leagues").select("id, slug, name, github_org").eq("kind", "company").in("github_org", logins)
    : { data: [] as { id: string; slug: string; name: string; github_org: string }[] };
  const { data: mine } = await sb
    .from("league_members")
    .select("league_id")
    .eq("developer_id", devId)
    .eq("status", "active");
  const activeIds = new Set((mine ?? []).map((m) => m.league_id as string));

  const orgs = (rows ?? []).map((r) => {
    const league = (leagues ?? []).find((l) => l.github_org === r.org_login);
    return {
      login: r.org_login as string,
      avatar_url: (r.avatar_url as string | null) ?? null,
      league: league ? { slug: league.slug, name: league.name } : null,
      joined: !!league && activeIds.has(league.id),
    };
  });
  return { orgs, verifiedOnce: orgs.length > 0 };
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const viewer = await getViewer();

  const { orgs, verifiedOnce } = viewer ? await loadOrgStates(viewer.id) : { orgs: [], verifiedOnce: false };

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-xl px-4 py-10">
        <Link href="/leagues" className="text-xs text-muted transition-colors hover:text-cream">
          &larr; Leagues
        </Link>
        <h1 className="mt-6 text-2xl text-cream md:text-3xl">
          Verify your <span className="text-lime">company</span>
        </h1>
        <p className="mt-3 text-[11px] leading-relaxed text-muted normal-case">
          Join your company&apos;s league by proving you&apos;re in its GitHub org. We read your org list once and
          never store your GitHub token.
        </p>

        <VerifyClient signedIn={!!viewer} verifiedOnce={verifiedOnce} orgs={orgs} error={error ?? null} />
      </div>
    </main>
  );
}
