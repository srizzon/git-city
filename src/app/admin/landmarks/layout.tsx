import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";

export default async function AdminLandmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");
  if (!isAdminUser(user)) redirect("/");

  return <>{children}</>;
}
