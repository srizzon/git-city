import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml, wrapInBaseTemplate } from "@/lib/email-template";

const TO = "samuel@thegitcity.com";
const FROM = "Git City <noreply@thegitcity.com>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`sponsorship-contact:${ip}`, 3, 60_000);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: {
    name?: string;
    email?: string;
    company?: string;
    role?: string;
    website?: string;
    formatInterest?: string;
    budget?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const company = (body.company ?? "").trim();
  const role = (body.role ?? "").trim();
  const website = (body.website ?? "").trim();
  const formatInterest = (body.formatInterest ?? "").trim();
  const budget = (body.budget ?? "").trim();
  const message = (body.message ?? "").trim();

  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!company || company.length > 200) {
    return NextResponse.json({ error: "Company is required" }, { status: 400 });
  }
  if (role.length > 100) {
    return NextResponse.json({ error: "Role is too long" }, { status: 400 });
  }
  if (!website || website.length > 300) {
    return NextResponse.json({ error: "Website is required" }, { status: 400 });
  }
  if (!formatInterest || formatInterest.length > 100) {
    return NextResponse.json(
      { error: "Format interest is required" },
      { status: 400 },
    );
  }
  if (budget.length > 50) {
    return NextResponse.json({ error: "Budget is too long" }, { status: 400 });
  }
  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message is required (max 2000 chars)" },
      { status: 400 },
    );
  }

  const roleRow = role
    ? `<tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Role</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${escapeHtml(role)}</td></tr>`
    : "";
  const budgetRow = budget
    ? `<tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Budget</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${escapeHtml(budget)}</td></tr>`
    : "";

  const html = wrapInBaseTemplate(`
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #111;">New Sponsorship inquiry</h2>
    <p style="font-size: 15px; color: #333; line-height: 1.6;">
      Someone wants to sponsor Git City.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 16px; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase; width: 140px;">Name</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${escapeHtml(name)}</td></tr>
      <tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Email</td><td style="padding: 8px 0; color: #111; font-size: 14px;"><a href="mailto:${escapeHtml(email)}" style="color: #111;">${escapeHtml(email)}</a></td></tr>
      <tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Company</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${escapeHtml(company)}</td></tr>
      ${roleRow}
      <tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Website</td><td style="padding: 8px 0; color: #111; font-size: 14px;"><a href="${escapeHtml(website)}" style="color: #111;">${escapeHtml(website)}</a></td></tr>
      <tr><td style="padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Format interest</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${escapeHtml(formatInterest)}</td></tr>
      ${budgetRow}
    </table>
    <div style="margin-top: 20px; padding: 16px; background-color: #f6f6f6; border-radius: 4px;">
      <p style="margin: 0 0 8px; color: #999; font-size: 12px; text-transform: uppercase;">Message</p>
      <p style="margin: 0; color: #111; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>
  `);

  try {
    const resend = getResend();
    await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: email,
      subject: `Sponsorship inquiry, ${company} (${name}), ${formatInterest}`,
      html,
    });
  } catch (err) {
    console.error("[sponsorship-contact] failed to send email", err);
    return NextResponse.json(
      { error: "Failed to send. Email samuel@thegitcity.com directly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
