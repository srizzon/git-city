import { redirect } from "next/navigation";

// The main /ads route redirects to the existing advertise landing page
// which has the full marketing content and purchase form
export default function AdsPage() {
  redirect("/advertise");
}
