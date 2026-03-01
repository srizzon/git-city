import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Git City",
  description: "Terms of Service for Git City.",
};

const ACCENT = "#c8e64a";

export default function TermsPage() {
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
          Terms of <span style={{ color: ACCENT }}>Service</span>
        </h1>
        <p className="mt-2 text-[10px] text-muted normal-case">
          Last updated: March 1, 2026
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <Section n={1} title="The Service">
            <p>
              Git City is a web application that visualizes GitHub profiles as 3D
              buildings in a virtual city. By using Git City, you agree to these
              terms.
            </p>
          </Section>

          <Section n={2} title="Account & Access">
            <p>
              You sign in via GitHub OAuth. We access your public GitHub data
              (profile, repositories, contribution count) to generate your
              building. We do not access private repositories or modify any data
              on your GitHub account.
            </p>
            <p>
              You are responsible for the security of your GitHub account. We are
              not liable for unauthorized access resulting from compromised
              GitHub credentials.
            </p>
          </Section>

          <Section n={3} title="User Conduct">
            <p>You agree not to:</p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>Abuse, exploit, or attempt to disrupt the service</Li>
              <Li>Scrape or collect data from Git City without permission</Li>
              <Li>Use automated systems to create fake accounts or inflate metrics</Li>
              <Li>Impersonate other users or misrepresent your identity</Li>
            </ul>
          </Section>

          <Section n={4} title="Intellectual Property">
            <p>
              Git City, its code, design, and branding are owned by Samuel
              Rizzon. Your GitHub data remains yours. By using the service, you
              grant us a limited license to display your public GitHub data as
              part of the city visualization.
            </p>
          </Section>

          <Section n={5} title="Purchases & Shop">
            <p>
              Git City offers optional cosmetic items for purchase. All purchases
              are final and non-refundable unless required by applicable law.
              Cosmetic items have no real-world value and exist only within Git
              City.
            </p>
          </Section>

          <Section n={6} title="Disclaimer of Warranties">
            <p>
              Git City is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, express or implied.
              We do not guarantee uptime, accuracy of data, or uninterrupted
              access. GitHub API limitations or outages may affect the service.
            </p>
          </Section>

          <Section n={7} title="Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Samuel Rizzon and Git City
              shall not be liable for any indirect, incidental, special, or
              consequential damages arising from your use of the service.
            </p>
          </Section>

          <Section n={8} title="Third-Party Token">
            <p>
              A token called $GITC exists on the Base blockchain. This token was
              created by the community, not by Git City or Samuel Rizzon. We do
              not control, manage, or endorse the token. Any interaction with the
              token is entirely at your own risk. See the{" "}
              <a
                href="/token"
                className="transition-colors hover:text-cream"
                style={{ color: ACCENT }}
              >
                token page
              </a>{" "}
              for more information.
            </p>
          </Section>

          <Section n={9} title="Changes to Terms">
            <p>
              We may update these terms at any time. Continued use of Git City
              after changes constitutes acceptance of the updated terms.
            </p>
          </Section>

          <Section n={10} title="Contact">
            <p>
              Questions? Reach out at{" "}
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
