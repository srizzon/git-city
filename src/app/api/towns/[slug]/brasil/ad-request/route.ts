import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import { button, callout, detailRows, heading, label, paragraph } from "@/lib/email/components";
import { renderLayout, renderText } from "@/lib/email/layout";
import { FROM_NOTIFY } from "@/lib/email/senders";
import { captureServer } from "@/lib/posthog-server";
import { ADVERTISER_KINDS, BUDGETS, advertiserLabel, budgetLabel, normalizeUrl, projectWeek, type AdvertiserKind, type Budget } from "@/lib/towns/brasil-projects";

// The ad slot's demand test: someone wants the #1 spot on the Brasil map's
// projects card. Nothing is booked or charged; the request lands in Samuel's
// inbox with what they'd pay, and he answers by hand.

const TO = "samuel@thegitcity.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`ad-request:${ip}`, 3, 60_000).ok) return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  // Hidden field only bots fill: pretend it worked.
  if (body.website) return NextResponse.json({ ok: true });

  const what = str(body.what, 80);
  const email = str(body.email, 200);
  const notes = str(body.notes, 1000);
  const kind = ADVERTISER_KINDS.includes(body.kind as AdvertiserKind) ? (body.kind as AdvertiserKind) : null;
  const budget = BUDGETS.includes(body.budget as Budget) ? (body.budget as Budget) : null;
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount >= 0 && body.amount < 1_000_000 ? Math.round(body.amount) : null;
  const weeks = Array.isArray(body.weeks) ? body.weeks.filter((w): w is string => typeof w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w)).slice(0, 4) : [];
  const url = normalizeUrl(str(body.url, 300));
  if (!what) return NextResponse.json({ error: "Say what you want to promote." }, { status: 400 });
  if ("error" in url) return NextResponse.json({ error: url.error }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Add an email we can answer." }, { status: 400 });
  if (!kind) return NextResponse.json({ error: "Pick who you are." }, { status: 400 });
  if (!budget && amount === null) return NextResponse.json({ error: "Tell us what you'd pay for a week." }, { status: 400 });

  const price = amount !== null ? `R$ ${amount.toLocaleString("en-US")}` : budgetLabel(budget!);
  const subject = `AD request: ${what} · ${price} · ${advertiserLabel[kind].toLowerCase()}`;
  const weekLine = weeks.length ? weeks.map((w) => `week of ${w}`).join(", ") : "any week";
  const reply = `mailto:${email}?subject=${encodeURIComponent(`Git City · #1 on the Brasil map for ${what}`)}`;
  const rows = [
    { label: "Promote", value: what },
    { label: "Link", value: url.url },
    { label: "Email", value: email },
    { label: "Who", value: advertiserLabel[kind] },
    { label: "Would pay (1 week)", value: price },
    { label: "Weeks", value: weekLine },
  ];
  const reason = "You get this because someone asked for the ad slot on the Brasil map.";
  const html = renderLayout({
    title: subject,
    preheader: `${what} would pay ${price} for a week at #1.`,
    body: [label("Brasil map · ad slot"), heading(what, undefined, " wants #1"), paragraph("Someone filled the ad request on the Brasil map's projects card. Reply to this email to answer them."), detailRows(rows), notes ? callout(notes) : paragraph("No notes.", { muted: true }), button("Reply", reply)].join("\n"),
    reason,
    links: { settingsUrl: null },
  });
  const text = renderText({ lines: [subject, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", notes || "No notes."], reason, links: { settingsUrl: null } });
  try {
    const { error } = await sendEmail({ from: FROM_NOTIFY, to: TO, replyTo: email, subject, html, text });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[ad-request] failed to send", err);
    return NextResponse.json({ error: "It didn't send. Try again." }, { status: 500 });
  }
  await captureServer(`ad:${email.toLowerCase()}`, "ad_request_emailed", { budget: budget ?? "typed", amount, kind, weeks: weeks.length, this_week: projectWeek(new Date()) });
  return NextResponse.json({ ok: true });
}
