import { redirect } from "next/navigation";

interface Props { params: Promise<{ username: string }> }

// Cutover: the shop was rebuilt into a public Shop (/shop) + an owner Customize
// screen (/shop/[username]/customize). This legacy route forwards inbound links
// to Customize, which gates to the owner itself.
export default async function LegacyShopRedirect({ params }: Props) {
  const { username } = await params;
  redirect(`/shop/${username.toLowerCase()}/customize`);
}
