import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";
import { wrapInBaseTemplate, buildButton, buildStatsTable } from "@/lib/email-template";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderWelcomeEmail } from "@/lib/notification-senders/welcome";
import { renderRaidEmail } from "@/lib/notification-senders/raid";
import { sendEmail } from "@/lib/resend";
import { EMAIL_PREVIEWS } from "@/lib/email/previews";
import { RECAP_DEV_COLUMNS, loadRecapContext, loadWeeklyRecaps, renderWeeklyRecapEmail } from "@/lib/notification-senders/weekly-recap";

const PREVIEW_LINKS = { unsubscribeUrl: "https://thegitcity.com/api/unsubscribe?dev=0&cat=all&token=preview" };

/**
 * GET /api/admin/email-preview?template=job-approved
 * Returns rendered HTML for email preview. Admin-only.
 * Add &send=1 to email that exact render to your own address, to check it in
 * real mail clients (Gmail, Apple Mail, Outlook) before shipping.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const template = req.nextUrl.searchParams.get("template") ?? "job-approved";

  const respond = async (email: { subject: string; html: string; text?: string }) => {
    if (req.nextUrl.searchParams.get("send") !== "1") {
      return new NextResponse(email.html, { headers: { "Content-Type": "text/html" } });
    }
    if (!user.email) return NextResponse.json({ error: "Your account has no email" }, { status: 400 });
    const { data, error } = await sendEmail({
      from: "Git City <noreply@thegitcity.com>",
      to: user.email,
      subject: `[Test] ${email.subject}`,
      html: email.html,
      text: email.text,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ sent: true, to: user.email, id: data?.id });
  };

  // Sample renders registered per area in src/lib/email/previews/.
  const preview = EMAIL_PREVIEWS[template];
  if (preview) return respond(await preview());

  // Emails on the new layout render through their real sender.
  // ?login= previews it for any developer, with their real rank.
  if (template === "welcome") {
    const login = req.nextUrl.searchParams.get("login") ?? "srizzon";
    const { data: dev } = await getSupabaseAdmin()
      .from("developers")
      .select("github_login, rank")
      .ilike("github_login", login)
      .maybeSingle();
    return respond(renderWelcomeEmail(dev?.github_login ?? login, dev?.rank ?? null, PREVIEW_LINKS));
  }

  // ?login= previews that developer's real last 7 days, even when the cron would skip them.
  if (template === "recap") {
    const login = req.nextUrl.searchParams.get("login") ?? "srizzon";
    const { data: dev } = await getSupabaseAdmin().from("developers").select(RECAP_DEV_COLUMNS).ilike("github_login", login).maybeSingle();
    if (!dev) return NextResponse.json({ error: "Developer not found" }, { status: 404 });
    const recaps = await loadWeeklyRecaps([dev], await loadRecapContext());
    return respond(renderWeeklyRecapEmail(recaps.get(dev.id)!, PREVIEW_LINKS));
  }

  // ?raid= previews a real raid from the defender's side; defaults to the latest one.
  if (template === "raid") {
    const sb = getSupabaseAdmin();
    const raidParam = req.nextUrl.searchParams.get("raid");
    const query = sb.from("raids").select("id, success, attack_score, defense_score, attacker_id, defender_id");
    const { data: raid } = raidParam
      ? await query.eq("id", raidParam).maybeSingle()
      : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!raid) return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    const { data: devs } = await sb.from("developers").select("id, github_login").in("id", [raid.attacker_id, raid.defender_id]);
    const loginOf = (id: number) => devs?.find((d) => d.id === id)?.github_login ?? "unknown";
    return respond(renderRaidEmail(
      {
        defenderLogin: loginOf(raid.defender_id),
        attackerLogin: loginOf(raid.attacker_id),
        raidId: raid.id,
        success: raid.success,
        attackScore: raid.attack_score,
        defenseScore: raid.defense_score,
      },
      PREVIEW_LINKS,
    ));
  }

  const TEMPLATES: Record<string, { subject: string; html: string }> = {
    "job-approved": {
      subject: "Your listing is live: Senior Frontend Engineer",
      html: `
        <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Your listing is live</p>
        <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Senior Frontend Engineer</h1>
        <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">Your job listing has been approved and is now visible to developers on Git City.</p>
        <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">It will remain active until <strong>April 30, 2026</strong>. You'll receive a reminder before it expires.</p>
        <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
        ${buildButton("View Dashboard", "#")}
      `,
    },
    "job-rejected": {
      subject: "Listing not approved: Backend Developer",
      html: `
        <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#ef4444; letter-spacing:1px; text-transform:uppercase;">Listing not approved</p>
        <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Backend Developer</h1>
        <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">Your job listing was not approved after review.</p>
        <div style="background-color:#fef2f2; border-left:4px solid #ef4444; padding:16px; margin:0 0 24px; border-radius:0 4px 4px 0;">
          <p style="margin:0; font-size:14px; color:#555555; line-height:1.6;"><strong style="color:#111111;">Reason:</strong> Description is too short. Please add more details about the role and requirements.</p>
        </div>
        ${buildButton("Edit Listing", "#")}
      `,
    },
    "job-application": {
      subject: "New candidate for Senior Frontend: @johndoe",
      html: `
        <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">New candidate</p>
        <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">@johndoe</h1>
        <p style="margin:0 0 16px; font-size:15px; color:#555555; line-height:1.6;">applied to <strong>Senior Frontend Engineer</strong></p>
        <div style="background-color:#f9fafb; padding:16px; border-radius:6px; margin:0 0 24px;">
          <p style="margin:0 0 4px; font-size:14px; color:#555555;">Quality score: <strong style="color:#111111;">78/100</strong></p>
          <p style="margin:0;"><span style="display:inline-block; background:#ecfdf5; color:#059669; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:600;">Has profile</span></p>
        </div>
        ${buildButton("View Candidates", "#")}
      `,
    },
    "job-expiring": {
      subject: "Your listing expires in 5 days: Full Stack Developer",
      html: `
        <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#f59e0b; letter-spacing:1px; text-transform:uppercase;">Expiring soon</p>
        <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Full Stack Developer</h1>
        <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">Your listing expires in <strong>5 days</strong>. Here's how it performed so far:</p>
        ${buildStatsTable([{ label: "Views", value: "1,234" }, { label: "Applications", value: "47" }])}
        ${buildButton("View Dashboard", "#")}
      `,
    },
    "job-hired": {
      subject: "You got hired!",
      html: `
        <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Congratulations!</p>
        <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">You got hired!</h1>
        <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;"><strong>Acme Corp</strong> confirmed your hire for <strong>Senior Frontend Engineer</strong>.</p>
        <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">Your "Hired in the City" achievement has been unlocked!</p>
        <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
        ${buildButton("View Your Profile", "#")}
      `,
    },
    "job-weekly-report": {
      subject: "Your Git City jobs: 1,234 views this week",
      html: `
        <h2 style="margin-top:0; font-family:'Silkscreen', monospace; color:#111111;">Weekly Jobs Report</h2>
        <p style="color:#555555; font-family:Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6;">Here's how your listings performed this week, Acme Corp.</p>
        ${buildStatsTable([{ label: "Views", value: "1,234" }, { label: "Applications", value: "47" }, { label: "Profile Views", value: "12" }])}
        ${buildButton("View Full Dashboard", "#")}
      `,
    },
  };

  const t = TEMPLATES[template];
  if (!t) {
    return NextResponse.json(
      { error: "Unknown template", available: ["welcome", "raid", "recap", ...Object.keys(EMAIL_PREVIEWS), ...Object.keys(TEMPLATES)] },
      { status: 400 },
    );
  }

  return respond({ subject: t.subject, html: wrapInBaseTemplate(t.html, PREVIEW_LINKS.unsubscribeUrl) });
}
