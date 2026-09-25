import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import { renderLandmarkInquiryEmail } from "@/lib/admin-emails";
import { FROM_NOTIFY } from "@/lib/email/senders";

const TO = "samuel@thegitcity.com";
const FROM = FROM_NOTIFY;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`landmark-contact:${ip}`, 3, 60_000);
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
    website?: string;
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
  const website = (body.website ?? "").trim();
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
  if (!website || website.length > 300) {
    return NextResponse.json({ error: "Website is required" }, { status: 400 });
  }
  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message is required (max 2000 chars)" },
      { status: 400 },
    );
  }

  const { subject, html, text } = renderLandmarkInquiryEmail({ name, email, company, website, message });

  try {
    const { error } = await sendEmail({
      from: FROM,
      to: TO,
      replyTo: email,
      subject,
      html,
      text,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[landmark-contact] failed to send email", err);
    return NextResponse.json(
      { error: "Failed to send. Email samuel@thegitcity.com directly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
