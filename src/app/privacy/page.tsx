import Link from "next/link";
import type { Metadata } from "next";
import {
  LEGAL_NAME,
  LEGAL_RAZAO_SOCIAL,
  LEGAL_CNPJ,
  LEGAL_COUNTRY,
  LEGAL_EMAIL,
} from "@/lib/legal";

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
          Last updated: April 27, 2026
        </p>
        <p className="mt-1 text-[10px] text-muted normal-case">
          {LEGAL_NAME} is operated by {LEGAL_RAZAO_SOCIAL} (CNPJ {LEGAL_CNPJ},{" "}
          {LEGAL_COUNTRY}). Contact:{" "}
          <a
            href={`mailto:${LEGAL_EMAIL}`}
            className="hover:text-cream"
            style={{ color: ACCENT }}
          >
            {LEGAL_EMAIL}
          </a>
          .
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
            <p className="mt-2">
              When you pay with the GITC token on Base, we also store your
              wallet address (a public blockchain address) and the transaction
              hash. These are linked to your Git City account so we can verify
              the payment, support customer service, and keep an audit trail.
              Wallet addresses are pseudonymous but publicly observable on the
              blockchain.
            </p>
            <p className="mt-2">
              We collect your IP address transiently for rate limiting, fraud
              prevention, and country detection (to show local payment methods
              like PIX). IP addresses are not stored long-term in user-facing
              tables; they appear only in transient logs and security records.
            </p>
          </Section>

          <Section n={2} title="How We Use Your Data">
            <ul className="flex flex-col gap-1">
              <Li>Generate your 3D building in the city</Li>
              <Li>Display your profile on the leaderboard</Li>
              <Li>Send notifications you opted into (email)</Li>
              <Li>Process purchases through our payment providers</Li>
              <Li>Improve the service and fix bugs</Li>
              <Li>Detect and prevent abuse (rate limiting, fraud)</Li>
            </ul>
          </Section>

          <Section n={3} title="Legal Basis for Processing (GDPR / LGPD)">
            <p>
              For users in the European Union and Brazil, we rely on the following
              legal bases under GDPR Article 6 and LGPD Article 7:
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                <span style={{ color: ACCENT }}>Contract</span> - Account
                creation, payment processing, and providing the service you
                signed up for.
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Legitimate interest</span> -
                Security, abuse prevention, aggregated analytics, and product
                improvement.
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Consent</span> - Optional email
                notifications and any future opt-in features. You can withdraw
                consent at any time.
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Legal obligation</span> -
                Tax records and responses to lawful authority requests.
              </Li>
            </ul>
          </Section>

          <Section n={4} title="Third-Party Services">
            <p>
              We use the following service providers. Each one only receives the
              minimum data needed for its purpose, and each has its own privacy
              policy.
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                <span style={{ color: ACCENT }}>Supabase</span> - Database and
                authentication (US-hosted)
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Vercel</span> - Hosting,
                serverless functions, analytics (US-hosted)
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Stripe</span> - Card payment
                processing
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>AbacatePay</span> - PIX payment
                processing (Brazil)
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>GitHub</span> - OAuth
                authentication and public API data
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Resend</span> - Transactional
                email delivery
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Reown (WalletConnect)</span> -
                Wallet connection sessions for crypto payments
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Alchemy / Ankr</span> - Base
                blockchain RPC providers (read-only, no user data sent)
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>GeckoTerminal / DexScreener</span>{" "}
                - Public token price feeds (no user data sent)
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Himetrica</span> - Aggregate
                product analytics (no PII)
              </Li>
            </ul>
            <p className="mt-1">
              We do NOT sell personal data. We do NOT share data with advertisers
              for cross-site behavioral advertising.
            </p>
          </Section>

          <Section n={5} title="International Data Transfers">
            <p>
              Most of our processors are located outside Brazil and the European
              Economic Area (primarily in the United States). When personal data
              is transferred internationally, we rely on safeguards approved by
              the relevant authorities — including the Standard Contractual
              Clauses approved by the Brazilian ANPD (Resolution 19/2024) and
              the equivalent Standard Contractual Clauses under the GDPR — or on
              other lawful transfer mechanisms.
            </p>
            <p className="mt-2">
              Blockchain data, including transactions you sign with your own
              wallet, is broadcast publicly and replicated globally by design.
              We have no ability to restrict or recall this data.
            </p>
          </Section>

          <Section n={6} title="Cookies & Local Storage">
            <p>
              We use a small number of cookies and similar storage. We do not
              use third-party advertising cookies.
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                <span style={{ color: ACCENT }}>Authentication</span> - Keeps
                you signed in. First-party, expires when you sign out or after
                inactivity.
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Preferences</span> - Theme,
                district selection, recently visited pages. Local storage,
                stays until you clear your browser.
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Wallet session</span> - When
                you connect a wallet, Reown / Wagmi store the connection state
                in cookies so the wallet stays connected across page reloads.
              </Li>
              <Li>
                <span style={{ color: ACCENT }}>Analytics</span> - Vercel and
                Himetrica use anonymous, aggregated metrics. No cross-site
                tracking.
              </Li>
            </ul>
          </Section>

          <Section n={7} title="Sponsored Content & Advertising">
            <p>
              Git City features sponsored landmark buildings and sky advertisements
              from third-party brands. We track aggregate impressions (when the
              sponsored content is visible on screen) and clicks (when you interact
              with it) to provide performance reports to sponsors. We do not share
              any personally identifiable information with sponsors. All reports
              contain only aggregate, anonymized data (total impressions, total
              clicks, geographic breakdown by country). Outbound links to sponsor
              websites include UTM parameters for their own analytics.
            </p>
          </Section>

          <Section n={8} title="Crypto Payments (GITC) — Important Disclaimers">
            <p>
              Paying with the GITC token on the Base blockchain is{" "}
              <strong>optional</strong>. Card and PIX remain available for all
              purchases.
            </p>
            <p className="mt-2">
              <strong>What happens technically:</strong>
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                You connect a wallet you control through Reown (WalletConnect).
                We never have access to your private keys, seed phrase, or any
                other credential of your wallet.
              </Li>
              <Li>
                Your wallet address and the transaction hash are stored on our
                servers and linked to your account for the lifetime of the
                purchase record (audit trail).
              </Li>
              <Li>
                Payments are sent to a public Git City treasury address on Base.
                Anyone can view received payments on a block explorer such as
                BaseScan.
              </Li>
              <Li>
                We use Alchemy or Ankr as read-only RPC providers to verify
                transactions. We use GeckoTerminal and DexScreener for public
                token price quotes.
              </Li>
              <Li>
                We do NOT track your wallet activity outside of payments to
                Git City. We do NOT sell or share wallet addresses with third
                parties.
              </Li>
            </ul>
            <p className="mt-3">
              <strong>What we are NOT:</strong>
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                We are NOT a cryptocurrency exchange, broker, custodian, money
                transmitter, or financial institution.
              </Li>
              <Li>
                We do NOT custody, hold, manage, or invest funds for any user.
                You always control your own wallet.
              </Li>
              <Li>
                We do NOT issue, mint, or operate the GITC token. GITC is a
                third-party community token that Git City did not create.
                Accepting GITC as a payment method does not imply any
                endorsement, partnership, or financial relationship between
                Git City and the token, its issuer, or its holders.
              </Li>
              <Li>
                We do NOT provide investment, tax, or legal advice. Nothing
                on this site is a recommendation to buy, sell, or hold any
                token. <strong>NFA, DYOR.</strong>
              </Li>
            </ul>
            <p className="mt-3">
              <strong>Risks you accept by paying with crypto:</strong>
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                Blockchain transactions are <strong>irreversible</strong>. Once
                a transfer is mined, it cannot be reversed by us, by the
                blockchain, or by any third party.
              </Li>
              <Li>
                If you send to a wrong address, sign a malicious transaction,
                or lose access to your wallet, the loss is permanent. We
                cannot recover funds.
              </Li>
              <Li>
                Token prices are volatile. The amount of GITC required for a
                purchase can change between when you receive a quote and when
                you sign — within a short window we account for slippage, but
                the price risk is yours.
              </Li>
              <Li>
                Network congestion or RPC issues may delay payment confirmation.
                If verification fails after you've paid, contact us — most
                cases can be reconciled manually.
              </Li>
            </ul>
            <p className="mt-3">
              By choosing to pay with GITC, you acknowledge these risks and
              accept full responsibility for the security of your wallet and
              the transactions you sign.
            </p>
          </Section>

          <Section n={9} title="Automated Decision-Making">
            <p>
              We do not subject you to decisions based solely on automated
              processing that produce legal or similarly significant effects
              about you. Some operational decisions (rate limiting, fraud
              flags, content moderation of ad text) are partially automated
              but reviewed by a human before any irreversible action is taken.
            </p>
          </Section>

          <Section n={10} title="Data Retention">
            <p>
              Active accounts: data is stored while your account exists.
            </p>
            <p className="mt-1">
              Inactive accounts: we may anonymize or delete data after 24
              months of inactivity.
            </p>
            <p className="mt-1">
              Payment records: retained for at least 5 years to comply with
              tax and accounting obligations.
            </p>
            <p className="mt-1">
              Expired/abandoned checkout sessions and unused crypto quotes:
              automatically deleted within 30 days.
            </p>
            <p className="mt-1">
              On-chain GITC payment transactions cannot be erased from the Base
              blockchain — only the link between your wallet address and your
              Git City account in our database can be removed.
            </p>
          </Section>

          <Section n={11} title="Your Rights">
            <p>
              Depending on your jurisdiction (LGPD in Brazil, GDPR in the EU/UK,
              CCPA/CPRA in California, and similar laws elsewhere), you may have
              the following rights:
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>Access: ask what personal data we hold about you</Li>
              <Li>Rectification: correct inaccurate or incomplete data</Li>
              <Li>Deletion / erasure: ask us to delete your data</Li>
              <Li>Restriction: limit how we process your data</Li>
              <Li>Portability: receive your data in a portable format</Li>
              <Li>
                Objection: object to processing based on legitimate interests
              </Li>
              <Li>
                Withdraw consent: for any processing based on consent, at any
                time
              </Li>
              <Li>
                Opt out of sale or sharing: we do not sell personal data, but
                this right is yours regardless
              </Li>
              <Li>
                Non-discrimination: we will not penalize you for exercising any
                of these rights
              </Li>
              <Li>
                Lodge a complaint: with your local data protection authority
                (ANPD in Brazil, your national DPA in the EU)
              </Li>
            </ul>
            <p className="mt-2">
              To exercise any right, email{" "}
              <a
                href="mailto:samuel@thegitcity.com"
                className="hover:text-cream"
                style={{ color: ACCENT }}
              >
                samuel@thegitcity.com
              </a>{" "}
              from the address linked to your account. We respond within 15 days
              (LGPD) or 30 days (GDPR / CCPA), and may extend for complex
              requests with notice.
            </p>
          </Section>

          <Section n={12} title="Security">
            <p>
              We use industry-standard security measures including encrypted
              connections (HTTPS), Row-Level Security on our database,
              service-role isolation for privileged operations, rate limiting
              on sensitive endpoints, and authentication through GitHub OAuth.
              However, no system is 100% secure. If we become aware of a data
              breach affecting you, we will notify you and the relevant
              authorities within the timeframes required by law (72 hours under
              GDPR; without undue delay under LGPD).
            </p>
          </Section>

          <Section n={13} title="Children">
            <p>
              Git City is not intended for children under 13 (or 16 in some
              EU jurisdictions). We do not knowingly collect personal data from
              children below the applicable age. If you believe a child has
              provided us with data, contact us and we will delete it promptly.
            </p>
          </Section>

          <Section n={14} title="Changes to This Policy">
            <p>
              We may update this policy at any time. The &ldquo;Last
              updated&rdquo; date at the top reflects the latest revision.
              Material changes will be communicated via email or an in-app
              notice when reasonably possible. Continued use of Git City after
              changes constitutes acceptance.
            </p>
          </Section>

          <Section n={15} title="Contact">
            <p>
              For privacy questions, data subject requests, or to report a
              security concern, contact:
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                Email:{" "}
                <a
                  href="mailto:samuel@thegitcity.com"
                  className="hover:text-cream"
                  style={{ color: ACCENT }}
                >
                  samuel@thegitcity.com
                </a>
              </Li>
              <Li>
                X / Twitter:{" "}
                <a
                  href="https://x.com/samuelrizzondev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-cream"
                  style={{ color: ACCENT }}
                >
                  @samuelrizzondev
                </a>
              </Li>
            </ul>
            <p className="mt-2">
              Brazilian users may also contact the ANPD (
              <a
                href="https://www.gov.br/anpd"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cream"
                style={{ color: ACCENT }}
              >
                gov.br/anpd
              </a>
              ). EU users may contact their national supervisory authority.
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
