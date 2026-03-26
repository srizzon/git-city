import { redirect } from "next/navigation";

// Legacy redirect: /ads/login → /business/login
export default function AdsLoginRedirect() {
  redirect("/business/login?redirect=/ads/dashboard");
}
