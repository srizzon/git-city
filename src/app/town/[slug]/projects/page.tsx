import { redirect } from "next/navigation";

// Every project is a board over the map now: old links and shares land there with it open.

type Props = { params: Promise<{ slug: string }> };

export default async function ProjectsPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/town/${slug}?projects=1`);
}
