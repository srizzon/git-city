import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase-server";
import JobBoardClient from "../../JobBoardClient";
import {
  ROLE_TYPE_LABELS,
  SENIORITY_LABELS,
  LOCATION_TYPE_LABELS,
} from "@/lib/jobs/constants";

/* ─── Static tag definitions for programmatic SEO ─── */

interface TagDef {
  title: string;
  description: string;
  filter: Record<string, string>;
}

const TECH_TAGS: Record<string, TagDef> = {
  react: { title: "React", description: "React and React Native developer jobs", filter: { stack: "react" } },
  nextjs: { title: "Next.js", description: "Next.js developer jobs", filter: { stack: "nextjs,next.js,next" } },
  typescript: { title: "TypeScript", description: "TypeScript developer jobs", filter: { stack: "typescript" } },
  node: { title: "Node.js", description: "Node.js and backend JavaScript jobs", filter: { stack: "node,nodejs,node.js" } },
  python: { title: "Python", description: "Python developer jobs", filter: { stack: "python" } },
  rust: { title: "Rust", description: "Rust developer jobs", filter: { stack: "rust" } },
  go: { title: "Go", description: "Go / Golang developer jobs", filter: { stack: "go,golang" } },
  vue: { title: "Vue.js", description: "Vue.js developer jobs", filter: { stack: "vue,vuejs,vue.js" } },
  angular: { title: "Angular", description: "Angular developer jobs", filter: { stack: "angular" } },
  svelte: { title: "Svelte", description: "Svelte developer jobs", filter: { stack: "svelte,sveltekit" } },
  docker: { title: "Docker", description: "Docker and containerization jobs", filter: { stack: "docker" } },
  kubernetes: { title: "Kubernetes", description: "Kubernetes and cloud-native jobs", filter: { stack: "kubernetes,k8s" } },
  aws: { title: "AWS", description: "AWS cloud developer jobs", filter: { stack: "aws" } },
  solidity: { title: "Solidity", description: "Solidity and smart contract jobs", filter: { stack: "solidity" } },
  tailwind: { title: "Tailwind CSS", description: "Tailwind CSS developer jobs", filter: { stack: "tailwind,tailwindcss" } },
  java: { title: "Java", description: "Java developer jobs", filter: { stack: "java" } },
  ruby: { title: "Ruby", description: "Ruby and Ruby on Rails jobs", filter: { stack: "ruby,rails,ruby-on-rails" } },
  elixir: { title: "Elixir", description: "Elixir and Phoenix developer jobs", filter: { stack: "elixir,phoenix" } },
  swift: { title: "Swift", description: "Swift and iOS developer jobs", filter: { stack: "swift" } },
  kotlin: { title: "Kotlin", description: "Kotlin and Android developer jobs", filter: { stack: "kotlin" } },
  "react-native": { title: "React Native", description: "React Native mobile developer jobs", filter: { stack: "react-native,react native" } },
  flutter: { title: "Flutter", description: "Flutter and Dart developer jobs", filter: { stack: "flutter,dart" } },
  graphql: { title: "GraphQL", description: "GraphQL developer jobs", filter: { stack: "graphql" } },
  postgres: { title: "PostgreSQL", description: "PostgreSQL and database jobs", filter: { stack: "postgres,postgresql" } },
};

// Role-based tags
const ROLE_TAGS: Record<string, TagDef> = Object.fromEntries(
  Object.entries(ROLE_TYPE_LABELS).map(([key, label]) => [
    key.replace("_", "-"),
    { title: `${label} Jobs`, description: `${label} developer jobs`, filter: { role: key } },
  ]),
);

// Seniority-based tags
const SENIORITY_TAGS: Record<string, TagDef> = Object.fromEntries(
  Object.entries(SENIORITY_LABELS).map(([key, label]) => [
    key,
    { title: `${label} Jobs`, description: `${label} developer jobs`, filter: { seniority: key } },
  ]),
);

// Location-based tags
const LOCATION_TAGS: Record<string, TagDef> = Object.fromEntries(
  Object.entries(LOCATION_TYPE_LABELS).map(([key, label]) => [
    key,
    { title: `${label} Jobs`, description: `${label} developer jobs`, filter: { location: key } },
  ]),
);

const ALL_TAGS: Record<string, TagDef> = {
  ...TECH_TAGS,
  ...ROLE_TAGS,
  ...SENIORITY_TAGS,
  ...LOCATION_TAGS,
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tag = ALL_TAGS[slug];
  if (!tag) return { title: "Jobs - Git City" };

  const title = `${tag.title} - Git City Jobs`;
  const description = `${tag.description}. Browse verified listings with transparent salaries on Git City.`;

  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function TagJobsPage({ params }: Props) {
  const { slug } = await params;
  const tag = ALL_TAGS[slug];
  if (!tag) notFound();

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const username = user
    ? (user.user_metadata?.user_name ?? user.user_metadata?.preferred_username ?? "") as string
    : null;

  // Build initial filter params from the tag definition
  const initialFilters = tag.filter;

  return (
    <Suspense>
      <JobBoardClient
        username={username}
        pageTitle={tag.title}
        pageDescription={tag.description}
        initialFilters={initialFilters}
      />
    </Suspense>
  );
}
