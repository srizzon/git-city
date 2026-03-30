import { redirect } from "next/navigation";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import CandidatesClient from "./CandidatesClient";

export default async function CandidatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) redirect("/business/login");

  return <CandidatesClient listingId={id} />;
}
