"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ACCENT = "#c8e64a";

function CopyButton({ text, label, copied, onCopy }: { text: string; label: string; copied: string | null; onCopy: (text: string, label: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text, label)}
      className="absolute right-2 top-2 border-[2px] px-2 py-1 text-[10px] transition-colors hover:text-cream"
      style={{ borderColor: ACCENT, color: copied === label ? ACCENT : "var(--color-muted)" }}
    >
      {copied === label ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, label, copied, onCopy }: { code: string; label: string; copied: string | null; onCopy: (text: string, label: string) => void }) {
  return (
    <div className="relative mt-3">
      <pre className="overflow-x-auto border-[2px] border-border bg-bg p-3 pr-16 text-xs text-cream leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} label={label} copied={copied} onCopy={onCopy} />
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-bold text-bg"
      style={{ backgroundColor: ACCENT }}
    >
      {n}
    </span>
  );
}

export default function IntegrationPage() {
  const [hasSecret, setHasSecret] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [method, setMethod] = useState<"pixel" | "s2s" | null>(null);

  useEffect(() => {
    fetch("/api/ads/webhook-secret")
      .then((r) => r.json())
      .then((d) => { setHasSecret(d.has_secret); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    const r = await fetch("/api/ads/webhook-secret", { method: "POST" });
    const d = await r.json();
    setSecret(d.webhook_secret);
    setHasSecret(true);
    setGenerating(false);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl text-cream">Conversion Tracking</h1>

      {/* How it works */}
      <div className="mt-5 border-[3px] border-border p-5">
        <h2 className="text-base text-cream">How it works</h2>
        <div className="mt-3 space-y-3 text-xs text-muted normal-case leading-relaxed">
          <div className="flex items-start">
            <StepNumber n={1} />
            <span>A user clicks your ad on Git City. We append <code className="text-cream">?gc_click_id=gc_...</code> to your URL.</span>
          </div>
          <div className="flex items-start">
            <StepNumber n={2} />
            <span>The user lands on your site with the click ID in the URL.</span>
          </div>
          <div className="flex items-start">
            <StepNumber n={3} />
            <span>When a conversion happens (signup, purchase, etc.), you send the click ID back to us.</span>
          </div>
          <div className="flex items-start">
            <StepNumber n={4} />
            <span>We match it to the original click and show conversions in your dashboard.</span>
          </div>
        </div>
      </div>

      {/* Choose method */}
      <div className="mt-5">
        <p className="text-sm text-muted normal-case">Select your integration method to get started:</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => setMethod("pixel")}
            className="group cursor-pointer border-[3px] p-4 text-left transition-all hover:border-[#c8e64a66]"
            style={{
              borderColor: method === "pixel" ? ACCENT : "var(--color-border)",
              backgroundColor: method === "pixel" ? ACCENT + "08" : undefined,
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-cream">Pixel</p>
              <span className="text-[10px] transition-colors group-hover:text-cream" style={{ color: method === "pixel" ? ACCENT : "var(--color-muted)" }}>
                {method === "pixel" ? "Selected" : "Select \u2192"}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted normal-case">
              Paste a script tag on your thank-you page. No backend needed.
            </p>
            <p className="mt-2 text-[10px] normal-case" style={{ color: ACCENT }}>Best for most users</p>
          </button>
          <button
            onClick={() => setMethod("s2s")}
            className="group cursor-pointer border-[3px] p-4 text-left transition-all hover:border-[#c8e64a66]"
            style={{
              borderColor: method === "s2s" ? ACCENT : "var(--color-border)",
              backgroundColor: method === "s2s" ? ACCENT + "08" : undefined,
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-cream">Server-to-Server</p>
              <span className="text-[10px] transition-colors group-hover:text-cream" style={{ color: method === "s2s" ? ACCENT : "var(--color-muted)" }}>
                {method === "s2s" ? "Selected" : "Select \u2192"}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted normal-case">
              Call our API from your backend. More reliable, needs API key.
            </p>
            <p className="mt-2 text-[10px] text-muted normal-case">For developers</p>
          </button>
        </div>
      </div>

      {/* Pixel instructions */}
      {method === "pixel" && (
        <div className="mt-5 space-y-4">
          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={1} />
              <h2 className="text-base text-cream">Store the click ID</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              When a user arrives from Git City, the URL will have <code className="text-cream">?gc_click_id=gc_...</code>.
              The pixel reads this automatically — no code needed on the landing page.
              It also persists across pages via sessionStorage, so multi-step funnels work.
            </p>
          </div>

          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={2} />
              <h2 className="text-base text-cream">Add the pixel to your conversion page</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              Paste this on the page where the conversion happens (e.g. thank-you page, post-signup page).
              Customize the attributes for your use case.
            </p>

            <CodeBlock
              label="pixel"
              copied={copied}
              onCopy={copy}
              code={`<script src="https://thegitcity.com/gc-pixel.js"
  data-event="purchase"
  data-order-id="ORDER_123"
  data-revenue="29.99">
</script>`}
            />

            <div className="mt-4 space-y-2 text-xs normal-case">
              <p className="text-muted">Attributes:</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <code className="text-cream">data-event</code>
                <span className="text-muted">Event name: signup, purchase, lead... (default: conversion)</span>
                <code className="text-cream">data-order-id</code>
                <span className="text-muted">Prevents duplicate conversions for the same order</span>
                <code className="text-cream">data-revenue</code>
                <span className="text-muted">Revenue in dollars (e.g. 29.99)</span>
              </div>
            </div>
          </div>

          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={3} />
              <h2 className="text-base text-cream">Check your dashboard</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              Conversions appear in your{" "}
              <Link href="/ads/dashboard" className="underline" style={{ color: ACCENT }}>dashboard</Link>
              {" "}within 15 minutes (next stats refresh).
            </p>
          </div>

          <p className="text-[10px] text-muted normal-case">
            That&apos;s it. No API keys, no webhooks, no backend changes.
          </p>
        </div>
      )}

      {/* S2S instructions */}
      {method === "s2s" && (
        <div className="mt-5 space-y-4">
          {/* Step 1: API Key */}
          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={1} />
              <h2 className="text-base text-cream">Get an API key</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              Go to{" "}
              <Link href="/ads/dashboard/api-keys" className="underline" style={{ color: ACCENT }}>API Keys</Link>
              {" "}and create one. You&apos;ll use it in the <code className="text-cream">Authorization</code> header.
            </p>
          </div>

          {/* Step 2: Webhook Secret */}
          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={2} />
              <h2 className="text-base text-cream">Generate a webhook secret</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              Used to sign requests so we know they&apos;re from you. Each request includes an HMAC-SHA256 signature of <code className="text-cream">{"{click_id}.{timestamp}"}</code>.
            </p>

            {secret ? (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto border-[2px] border-border bg-bg px-3 py-2 text-xs text-cream">
                    {secret}
                  </code>
                  <button
                    onClick={() => copy(secret, "secret")}
                    className="shrink-0 border-[2px] px-3 py-2 text-xs transition-colors hover:text-cream"
                    style={{ borderColor: ACCENT, color: copied === "secret" ? ACCENT : "var(--color-muted)" }}
                  >
                    {copied === "secret" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted normal-case">
                  Save this now — it won&apos;t be shown again.
                </p>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-press mt-3 px-5 py-2 text-xs text-bg"
                style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}
              >
                {generating ? "Generating..." : hasSecret ? "Regenerate Secret" : "Generate Secret"}
              </button>
            )}
          </div>

          {/* Step 3: Store click ID */}
          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={3} />
              <h2 className="text-base text-cream">Store the click ID on your side</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              When a user arrives from Git City, read <code className="text-cream">gc_click_id</code> from the URL query string and store it
              (cookie, session, database — whatever works for your stack). You&apos;ll need it when the conversion happens.
            </p>
          </div>

          {/* Step 4: Send conversion */}
          <div className="border-[3px] border-border p-5">
            <div className="flex items-center">
              <StepNumber n={4} />
              <h2 className="text-base text-cream">Send the conversion</h2>
            </div>
            <p className="mt-2 text-xs text-muted normal-case leading-relaxed">
              When the user converts, call our API from your backend:
            </p>

            <p className="mt-4 text-xs text-cream">Node.js</p>
            <CodeBlock
              label="node"
              copied={copied}
              onCopy={copy}
              code={`import crypto from "crypto";

const API_KEY = "gc_ak_...";
const WEBHOOK_SECRET = "gc_ws_...";

async function trackConversion(clickId, { eventName, orderId, revenue }) {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(\`\${clickId}.\${timestamp}\`)
    .digest("hex");

  const res = await fetch("https://thegitcity.com/api/v1/ads/conversions", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      click_id: clickId,
      event_name: eventName ?? "conversion",
      order_id: orderId,
      revenue,
      signature,
      timestamp,
    }),
  });

  return res.json(); // { ok: true, conversion_id: 123 }
}`}
            />

            <p className="mt-4 text-xs text-cream">cURL</p>
            <CodeBlock
              label="curl"
              copied={copied}
              onCopy={copy}
              code={`CLICK_ID="gc_..."
TIMESTAMP=$(date +%s%3N)
SIGNATURE=$(echo -n "$CLICK_ID.$TIMESTAMP" \\
  | openssl dgst -sha256 -hmac "YOUR_WEBHOOK_SECRET" \\
  | awk '{print $2}')

curl -X POST https://thegitcity.com/api/v1/ads/conversions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"click_id\\": \\"$CLICK_ID\\",
    \\"event_name\\": \\"purchase\\",
    \\"order_id\\": \\"order_123\\",
    \\"revenue\\": 29.99,
    \\"signature\\": \\"$SIGNATURE\\",
    \\"timestamp\\": $TIMESTAMP
  }"`}
            />
          </div>
        </div>
      )}

      {/* API Reference — always visible once a method is chosen */}
      {method && (
        <div className="mt-5 border-[3px] border-border p-5">
          <h2 className="text-base text-cream">API Reference</h2>
          <p className="mt-2 text-xs text-muted normal-case">
            <code className="text-cream">POST /api/v1/ads/conversions</code>
          </p>

          <table className="mt-3 w-full text-xs normal-case">
            <thead>
              <tr className="border-b-[2px] border-border text-left">
                <th className="py-2 font-normal text-muted">Field</th>
                <th className="py-2 font-normal text-muted">Required</th>
                <th className="py-2 font-normal text-muted">Description</th>
              </tr>
            </thead>
            <tbody className="text-cream">
              {[
                ["click_id", "Always", "The gc_... value from the URL"],
                ["event_name", "No", "signup, purchase, lead... (default: conversion)"],
                ["order_id", "No", "Prevents duplicates for the same order"],
                ["revenue", "No", "Amount in dollars (e.g. 29.99)"],
                ["currency", "No", "ISO 4217 code (default: USD)"],
                ...(method === "s2s"
                  ? [
                      ["signature", "S2S only", "HMAC-SHA256 of {click_id}.{timestamp}"],
                      ["timestamp", "S2S only", "Unix milliseconds (max 5 min drift)"],
                    ]
                  : []),
              ].map(([field, req, desc]) => (
                <tr key={field} className="border-b border-border">
                  <td className="py-2"><code>{field}</code></td>
                  <td className="py-2 text-muted">{req}</td>
                  <td className="py-2 text-muted">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 text-[10px] text-muted normal-case">
            <p>Responses: <code className="text-cream">201</code> created, <code className="text-cream">409</code> duplicate order_id, <code className="text-cream">404</code> click not found or expired (30 days).</p>
            <p>Rate limits: {method === "pixel" ? "10" : "60"} requests/min per IP.</p>
          </div>
        </div>
      )}
    </div>
  );
}
