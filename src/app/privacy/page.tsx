import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Git City",
  description: "Privacy Policy for Git City.",
};

const ACCENT = "#c8e64a";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
        >
          &larr; Back to City
        </Link>

        <h1 className="text-2xl text-cream sm:text-3xl">
          Privacy <span style={{ color: ACCENT }}>Policy</span>
        </h1>
        <p className="mt-2 text-[10px] text-muted normal-case">
          Last updated: March 1, 2026
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <Section n={1} title="Data We Collect">
            <p>When you sign in with GitHub, we receive and store:</p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>GitHub username and profile picture</Li>
              <Li>Public repository count, star count, and contribution data</Li>
              <Li>Email address (from your GitHub account)</Li>
            </ul>
            <p className="mt-1">
              We do NOT access your private repositories, code, or any non-public
              GitHub data.
            </p>
          </Section>

          <Section n={2} title="How We Use Your Data">
            <ul className="flex flex-col gap-1">
              <Li>Generate your 3D building in the city</Li>
              <Li>Display your profile on the leaderboard</Li>
              <Li>Send notifications you opted into (email)</Li>
              <Li>Process purchases through our payment providers</Li>
              <Li>Improve the service and fix bugs</Li>
            </ul>
          </Section>

          <Section n={3} title="Third-Party Services">
            <p>We use the following third-party services:</p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                <span style={{ color: ACCENT }}>Supabase</span> - Database and
                authentication
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Vercel</span> - Hosting and
                analytics
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Stripe</span> - Payment
                processing
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>GitHub</span> - OAuth
                authentication and public API data
              </Li>
            </ul>
            <p className="mt-1">
              Each service has its own privacy policy. We recommend reviewing
              them.
            </p>
          </Section>

          <Section n={4} title="Cookies & Local Storage">
            <p>
              We use cookies for authentication sessions and local storage for
              user preferences (theme, district selection). We use Vercel
              Analytics for anonymous usage data. No third-party tracking cookies
              are used.
            </p>
          </Section>

          <Section n={5} title="Data Retention">
            <p>
              Your data is stored as long as your account exists. If you want
              your data removed, contact us and we will delete your account and
              associated data.
            </p>
          </Section>

          <Section n={6} title="Your Rights">
            <p>You have the right to:</p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>Access the data we store about you</Li>
              <Li>Request correction of inaccurate data</Li>
              <Li>Request deletion of your data</Li>
              <Li>Opt out of email notifications at any time</Li>
            </ul>
          </Section>

          <Section n={7} title="Security">
            <p>
              We use industry-standard security measures including encrypted
              connections (HTTPS), Row-Level Security on our database, and secure
              authentication through GitHub OAuth. However, no system is 100%
              secure.
            </p>
          </Section>

          <Section n={8} title="Children">
            <p>
              Git City is not intended for children under 13. We do not knowingly
              collect data from children under 13. If you believe a child has
              provided us with data, contact us for removal.
            </p>
          </Section>

          <Section n={9} title="Changes">
            <p>
              We may update this policy at any time. Continued use of Git City
              after changes constitutes acceptance.
            </p>
          </Section>

          <Section n={10} title="Contact">
            <p>
              Questions about your data? Reach out at{" "}
              <a
                href="https://x.com/samuelrizzondev"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-cream"
                style={{ color: ACCENT }}
              >
                @samuelrizzondev
              </a>{" "}
              on X.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
      <p className="text-sm text-cream">
        <span style={{ color: "#c8e64a" }}>{String(n).padStart(2, "0")}.</span>{" "}
        {title}
      </p>
      <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-muted normal-case">
        {children}
      </div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span style={{ color: "#c8e64a" }}>+</span>
      <span>{children}</span>
    </li>
  );
}
