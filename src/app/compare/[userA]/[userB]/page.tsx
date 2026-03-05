import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { CompareRedirect } from "./compare-redirect";

type Props = {
  params: Promise<{ userA: string; userB: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userA, userB } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [{ data: devA }, { data: devB }] = await Promise.all([
    supabase
      .from("developers")
      .select("github_login, contributions, contributions_total, total_stars, rank")
      .eq("github_login", userA.toLowerCase())
      .single(),
    supabase
      .from("developers")
      .select("github_login, contributions, contributions_total, total_stars, rank")
      .eq("github_login", userB.toLowerCase())
      .single(),
  ]);

  const title = `@${userA} vs @${userB} - Git City`;

  if (!devA || !devB) {
    return {
      title,
      description: `Compare ${userA} and ${userB} in Git City`,
    };
  }

  const contribsA =
    devA.contributions_total && devA.contributions_total > 0
      ? devA.contributions_total
      : devA.contributions;
  const contribsB =
    devB.contributions_total && devB.contributions_total > 0
      ? devB.contributions_total
      : devB.contributions;
  const description = `@${devA.github_login} (#${devA.rank ?? "?"}, ${contribsA.toLocaleString()} contributions, ${devA.total_stars.toLocaleString()} stars) vs @${devB.github_login} (#${devB.rank ?? "?"}, ${contribsB.toLocaleString()} contributions, ${devB.total_stars.toLocaleString()} stars)`;

  return {
    title,
    description,
  };
}

export default async function ComparePage({ params }: Props) {
  const { userA, userB } = await params;
  return <CompareRedirect userA={userA} userB={userB} />;
}
