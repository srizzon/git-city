import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hire from Git City - Jobs",
  description: "67K+ verified GitHub developers. Post your job on Git City.",
};

interface Props {
  searchParams: Promise<{ ref?: string }>;
}

export default async function ReferPage({ searchParams }: Props) {
  const { ref } = await searchParams;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full border-[3px] border-border bg-bg-raised p-6 sm:p-10 text-center space-y-8">
          <h1 className="text-2xl text-lime sm:text-3xl">
            Hire from Git City
          </h1>
          <p className="text-sm text-cream-dark normal-case leading-relaxed">
            67K+ verified GitHub developers. Every candidate has real, public contributions you can audit before you talk. No fake profiles. No AI-generated resumes.
          </p>

          <div className="space-y-3 text-left">
            <div className="border-[3px] border-border p-4">
              <span className="text-xs text-lime">Verified Data</span>
              <p className="mt-1 text-xs text-muted normal-case">Real GitHub contributions, stars, streaks — not self-reported</p>
            </div>
            <div className="border-[3px] border-border p-4">
              <span className="text-xs text-lime">Curated Community</span>
              <p className="mt-1 text-xs text-muted normal-case">Only active developers who claimed their building in the city</p>
            </div>
            <div className="border-[3px] border-border p-4">
              <span className="text-xs text-lime">Trust Badges</span>
              <p className="mt-1 text-xs text-muted normal-case">Response Guaranteed + No AI Screening badges build candidate trust</p>
            </div>
            <div className="border-[3px] border-border p-4">
              <span className="text-xs text-lime">From $99/listing</span>
              <p className="mt-1 text-xs text-muted normal-case">30 days, salary-transparent, manually reviewed</p>
            </div>
          </div>

          <Link
            href={`/business/login?redirect=/jobs/dashboard${ref ? `&ref=${ref}` : ""}`}
            className="btn-press inline-block bg-lime px-10 py-4 text-base text-bg"
            style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
          >
            Post a Job
          </Link>

          {ref && (
            <p className="text-xs text-dim normal-case">
              Referred by a Git City developer
            </p>
          )}
        </div>
      </div>

      {ref && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.setItem('gc_referral','${ref.replace(/[^a-f0-9]/g, "")}')}catch(e){}`,
          }}
        />
      )}
    </main>
  );
}
