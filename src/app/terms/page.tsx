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
          Last updated: October 20, 2026
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
          <Section n={1} title="Acceptance of Terms">
            <p>
              By accessing or using Git City (the &ldquo;Service&rdquo;), you
              agree to be bound by these Terms of Service and by our{" "}
              <Link
                href="/privacy"
                className="hover:text-cream"
                style={{ color: ACCENT }}
              >
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
            <p className="mt-2">
              These Terms constitute a binding agreement between you and{" "}
              {LEGAL_RAZAO_SOCIAL} (CNPJ {LEGAL_CNPJ}), which operates the
              Service under the trading name &ldquo;{LEGAL_NAME}&rdquo;.
            </p>
          </Section>

          <Section n={2} title="The Service">
            <p>
              Git City is a web application that visualizes GitHub profiles as
              3D buildings in a virtual city. The Service is free. It includes
              an in-game currency (Pixels / PX) that you earn by playing and
              spend on cosmetic items, and an optional way to get Pixels by
              burning the GITC token.
            </p>
            <p className="mt-2">
              We may add, change, or remove features at any time, with or
              without notice. Material changes that affect your items or
              Pixels will be communicated by email or in-app notice.
            </p>
          </Section>

          <Section n={3} title="Eligibility">
            <p>
              You must be at least 13 years old (or 16 in the European Economic
              Area, where stricter) to use Git City. If you are under the legal
              age of majority in your jurisdiction, you must have permission
              from a parent or legal guardian.
            </p>
            <p className="mt-2">
              You must have legal capacity to enter into binding contracts in
              your jurisdiction. You must not be barred from receiving services
              under applicable law (sanctions lists, etc.).
            </p>
          </Section>

          <Section n={4} title="Account & Security">
            <p>
              You sign in via GitHub OAuth. We access your public GitHub data
              (profile, repositories, contribution count) to generate your
              building. We do not access private repositories or modify any
              data on your GitHub account.
            </p>
            <p className="mt-2">
              You are responsible for the security of your GitHub account and,
              where applicable, your crypto wallet. We are not liable for
              unauthorized access resulting from compromised GitHub credentials
              or compromised wallet credentials.
            </p>
            <p className="mt-2">
              We may suspend or terminate accounts that violate these Terms,
              are inactive for an extended period, or for any other reason
              consistent with applicable law and our Privacy Policy.
            </p>
          </Section>

          <Section n={5} title="User Conduct">
            <p>You agree not to:</p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>Abuse, exploit, or attempt to disrupt the Service</Li>
              <Li>Scrape or collect data from Git City without permission</Li>
              <Li>
                Use automated systems to create fake accounts or inflate metrics
              </Li>
              <Li>Impersonate other users or misrepresent your identity</Li>
              <Li>
                Reverse-engineer, decompile, or attempt to extract source code
                of proprietary parts of the Service
              </Li>
              <Li>
                Submit unlawful, infringing, defamatory, harassing, hateful,
                deceptive, or sexually explicit content
              </Li>
              <Li>
                Use the Service in violation of any applicable law (including
                sanctions, export controls, and tax law)
              </Li>
            </ul>
          </Section>

          <Section n={6} title="User Content">
            <p>
              When you submit content (names, links, colors, custom assets),
              you represent that you own or have the
              right to use that content, and that it does not violate any law
              or third-party right.
            </p>
            <p className="mt-2">
              You grant {LEGAL_NAME} a worldwide, non-exclusive, royalty-free
              license to host, display, reproduce, and distribute your content
              within the Service for the duration of your account (and as
              needed for backup and audit). You retain ownership of your
              content.
            </p>
            <p className="mt-2">
              We may, at our sole discretion, refuse, remove, or moderate
              content that violates these Terms or that we deem inappropriate,
              including after it is published.
            </p>
            <p className="mt-2">
              Projects you post on the Brasil map are checked before and after
              they show, automatically (including by an AI model that reads the
              page you link to) and by a person. Links to betting, gambling,
              scams, malware or adult content are refused or taken down, and
              posting them can end your right to post.
            </p>
          </Section>

          <Section n={7} title="Intellectual Property">
            <p>
              Git City — including its name, logo, source code (except
              open-source portions clearly marked as such), 3D assets, design,
              and trademarks — belongs to {LEGAL_NAME} or its licensors.
              Open-source portions are governed by their respective licenses.
            </p>
            <p className="mt-2">
              Your GitHub data remains yours. By using the Service, you grant
              us a limited license to display your public GitHub data as part
              of the city visualization.
            </p>
          </Section>

          <Section n={8} title="Pixels (PX)">
            <p>
              Git City does not sell anything for money. Pixels are an in-game
              currency you earn by checking in, coding on GitHub, completing
              daily missions, playing and other in-game actions, or get by
              burning GITC (Section 10). You spend them on cosmetic items and
              in-game upgrades.
            </p>
            <p className="mt-2">
              Pixels and items have no cash value. They cannot be bought with
              money, withdrawn, sold, or turned back into money or crypto. We may
              change how many Pixels an action pays, item prices, and daily
              limits at any time, and may remove Pixels or items obtained
              through bugs, automation, or other abuse.
            </p>
          </Section>

          <Section n={9} title="Past Purchases">
            <p>
              Git City used to accept card, PIX and crypto payments. It no
              longer does. Items and Pixels bought before that stay on your
              account. For a question about a past purchase, contact us at{" "}
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                className="hover:text-cream"
                style={{ color: ACCENT }}
              >
                {LEGAL_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section n={10} title="GITC for Pixels — Important Disclaimers">
            <p>
              Getting Pixels by burning the GITC token on the Base blockchain
              is <strong>optional</strong>: every item can be earned by
              playing. The GITC you pay is sent to the burn address and
              destroyed. Nobody receives it, including {LEGAL_NAME}, and a burn
              cannot be refunded. By choosing this method, you acknowledge and
              accept the following:
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>
                <strong>{LEGAL_NAME} is not a cryptocurrency exchange,</strong>{" "}
                broker, custodian, money transmitter, or financial institution.
              </Li>
              <Li>
                <strong>We do not custody your funds.</strong> You sign every
                transaction yourself. We never have access to your private
                keys, seed phrase, or wallet credentials.
              </Li>
              <Li>
                <strong>We did not create the GITC token.</strong> It is a
                third-party community token. Accepting GITC for Pixels does
                not constitute an endorsement, partnership,
                guarantee, or any financial relationship with the token, its
                issuer, or its holders.
              </Li>
              <Li>
                <strong>This is not investment, tax, or legal advice.</strong>{" "}
                Nothing on the Service is a recommendation to acquire, hold,
                or dispose of any crypto asset. NFA, DYOR.
              </Li>
              <Li>
                <strong>Blockchain transactions are irreversible.</strong> If
                you send to a wrong address, sign a malicious transaction, or
                lose access to your wallet, the loss is permanent and cannot
                be reversed by us.
              </Li>
              <Li>
                <strong>Token prices are volatile.</strong> The amount of GITC
                required for a Pixel pack can change between quote and
                signature. Quotes include a slippage buffer but the price
                risk is yours.
              </Li>
              <Li>
                <strong>Tax responsibility is yours.</strong> Crypto
                transactions may have tax consequences in your jurisdiction.
                You are solely responsible for reporting and paying any
                applicable taxes.
              </Li>
            </ul>
            <p className="mt-2">
              By burning GITC for Pixels, you confirm that you are legally permitted
              to do so in your jurisdiction and that you are not on any
              sanctions list.
            </p>
          </Section>

          <Section n={11} title="Sponsored Content">
            <p>
              Some landmark buildings and sky ads show brands that sponsored
              Git City in the past, or Git City&apos;s own projects. Git City
              does not sell advertising space.
            </p>
          </Section>

          <Section n={12} title="Termination">
            <p>
              You may stop using the Service at any time. To delete your
              account and associated data, contact us at{" "}
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                className="hover:text-cream"
                style={{ color: ACCENT }}
              >
                {LEGAL_EMAIL}
              </a>
              .
            </p>
            <p className="mt-2">
              We may suspend or terminate your access immediately, with or
              without notice, for breach of these Terms, fraudulent activity,
              illegal use of the Service, or as required by law. Upon
              termination, your items and Pixels are removed, but on-chain
              transactions and past payment records remain as historical
              records.
            </p>
          </Section>

          <Section n={13} title="Disclaimer of Warranties">
            <p>
              The Service is provided{" "}
              <strong>&ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo;</strong>{" "}
              without warranty of any kind, express or implied, including but
              not limited to merchantability, fitness for a particular purpose,
              non-infringement, accuracy, uptime, or that the Service will be
              error-free.
            </p>
            <p className="mt-2">
              We do not warrant the accuracy of price quotes, blockchain
              network availability, third-party service availability (RPC
              providers, GitHub), or that GitHub-derived
              data will be up to date at any given moment.
            </p>
          </Section>

          <Section n={14} title="Limitation of Liability">
            <p>
              To the maximum extent permitted by law, in no event will{" "}
              {LEGAL_RAZAO_SOCIAL}, its officers, employees, contractors, or
              affiliates be liable for any indirect, incidental, special,
              consequential, or punitive damages, or for any loss of profits,
              revenue, data, goodwill, or other intangible losses, arising
              out of or in connection with your use of the Service.
            </p>
            <p className="mt-2">
              In any case, our total cumulative liability for any claim
              arising out of or relating to these Terms or the Service will
              not exceed the greater of (a) the amount you paid to{" "}
              {LEGAL_NAME} in the twelve (12) months preceding the event
              giving rise to the claim, or (b) USD $50.
            </p>
            <p className="mt-2">
              Some jurisdictions do not allow the exclusion or limitation of
              certain damages; in such jurisdictions, our liability will be
              limited to the maximum extent permitted.
            </p>
          </Section>

          <Section n={15} title="Indemnification">
            <p>
              You agree to indemnify and hold harmless {LEGAL_RAZAO_SOCIAL}{" "}
              and its officers, employees, contractors, and affiliates from
              any claim, demand, loss, or expense (including reasonable legal
              fees) arising out of:
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              <Li>Your breach of these Terms</Li>
              <Li>Your content submitted to the Service</Li>
              <Li>Your violation of any law or third-party right</Li>
              <Li>
                Misuse of the Service or of the GITC burn functionality
              </Li>
            </ul>
          </Section>

          <Section n={16} title="Force Majeure">
            <p>
              We are not liable for any failure or delay in performance caused
              by events beyond our reasonable control, including but not
              limited to: outages of cloud or infrastructure providers,
              blockchain network congestion or reorgs,
              cyberattacks, government actions, internet outages, fires,
              floods, or other natural disasters.
            </p>
          </Section>

          <Section n={17} title="Governing Law and Jurisdiction">
            <p>
              These Terms are governed by the laws of the Federative Republic
              of Brazil, without regard to conflict-of-law principles.
            </p>
            <p className="mt-2">
              Any dispute arising from or related to these Terms or the
              Service will be resolved in the courts of the State of São
              Paulo, Brazil, except where Brazilian consumer law (Código de
              Defesa do Consumidor) grants the consumer a non-waivable right
              to file in their domicile.
            </p>
          </Section>

          <Section n={18} title="Modifications">
            <p>
              We may update these Terms at any time. The &ldquo;Last
              updated&rdquo; date at the top reflects the latest revision.
              Material changes will be communicated by email or in-app notice
              when reasonably possible. Continued use of the Service after
              changes constitutes acceptance.
            </p>
          </Section>

          <Section n={19} title="Severability and Waiver">
            <p>
              If any provision of these Terms is held invalid or unenforceable,
              the remaining provisions will continue in full force. Our
              failure to enforce any right or provision is not a waiver of
              that right or provision.
            </p>
          </Section>

          <Section n={20} title="Entire Agreement">
            <p>
              These Terms, together with our Privacy Policy and any policies
              referenced herein, constitute the entire agreement between you
              and {LEGAL_NAME} regarding the Service, and supersede any prior
              agreements.
            </p>
          </Section>

          <Section n={21} title="Contact">
            <p>
              {LEGAL_RAZAO_SOCIAL}
              <br />
              CNPJ {LEGAL_CNPJ}
              <br />
              Trading as &ldquo;{LEGAL_NAME}&rdquo;
              <br />
              {LEGAL_COUNTRY}
              <br />
              Email:{" "}
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                className="hover:text-cream"
                style={{ color: ACCENT }}
              >
                {LEGAL_EMAIL}
              </a>
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
