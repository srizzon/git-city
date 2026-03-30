import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { wrapInBaseTemplate, buildButton, buildStatsTable } from "@/lib/email-template";

/**
 * GET /api/admin/email-preview?template=job-approved
 * Returns rendered HTML for email preview. Admin-only.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const template = req.nextUrl.searchParams.get("template") ?? "job-approved";

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
      { error: "Unknown template", available: Object.keys(TEMPLATES) },
      { status: 400 },
    );
  }

  const fullHtml = wrapInBaseTemplate(t.html, "https://thegitcity.com/api/unsubscribe?dev=0&cat=all&token=preview");

  return new NextResponse(fullHtml, {
    headers: { "Content-Type": "text/html" },
  });
}
