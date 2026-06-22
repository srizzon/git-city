import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

type AdminLink = {
  href: string;
  title: string;
  description: string;
};

const SECTIONS: { heading: string; links: AdminLink[] }[] = [
  {
    heading: "Live ops",
    links: [
      {
        href: "/admin/events",
        title: "Bug Invasion · Events",
        description: "Schedule, start, end and inspect boss events",
      },
      {
        href: "/admin/drops",
        title: "Drops",
        description: "Spawn loot drops on buildings",
      },
      {
        href: "/admin/landmarks",
        title: "Landmarks",
        description: "Featured developer landmark buildings",
      },
    ],
  },
  {
    heading: "Catalog",
    links: [
      {
        href: "/admin/cosmetics",
        title: "Cosmetics",
        description: "Avatar and building cosmetics gallery",
      },
      {
        href: "/admin/emblems",
        title: "Emblems",
        description: "Merit-honors catalog — create, preview, grant",
      },
      {
        href: "/admin/jobs",
        title: "Jobs & Companies",
        description: "Job board listings and company profiles",
      },
      {
        href: "/admin/ads",
        title: "Ads",
        description: "Sponsorship slots, inventory and revenue",
      },
    ],
  },
  {
    heading: "Monitoring",
    links: [
      {
        href: "/admin/email-monitoring",
        title: "Email deliverability",
        description: "Sent, bounced, failed and suppressed counts",
      },
    ],
  },
];

export default async function AdminHomePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) redirect("/");

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-sm text-cream">Admin</h1>
        <p className="mt-1 text-[11px] text-muted">
          Signed in as <span className="text-cream-dark">@{login}</span> · quick access to all admin tools
        </p>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-3 text-[11px] uppercase tracking-wider text-dim">
                {section.heading}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group block border border-border bg-bg-raised p-4 transition-colors hover:border-lime/40 hover:bg-bg-card"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-cream group-hover:text-lime">
                        {link.title}
                      </span>
                      <span className="text-[10px] text-dim group-hover:text-lime">
                        {link.href}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted">{link.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
