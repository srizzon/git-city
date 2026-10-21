import { redirect } from "next/navigation";
import { BRASIL_SLUG } from "@/lib/towns/brasil-server";

// A short link to the Brasil map's projects page.
export default function BrasilProjectsLink() {
  redirect(`/town/${BRASIL_SLUG}?projects=1`);
}
