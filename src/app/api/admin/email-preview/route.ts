import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderWelcomeEmail } from "@/lib/notification-senders/welcome";
import { renderRaidEmail } from "@/lib/notification-senders/raid";
import { sendEmail } from "@/lib/resend";
import { EMAIL_PREVIEWS } from "@/lib/email/previews";
import { RECAP_DEV_COLUMNS, loadRecapContext, loadWeeklyRecaps, renderWeeklyRecapEmail } from "@/lib/notification-senders/weekly-recap";
import { FROM_NOTIFY } from "@/lib/email/senders";

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
      from: FROM_NOTIFY,
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

  return NextResponse.json(
    { error: "Unknown template", available: ["welcome", "raid", "recap", ...Object.keys(EMAIL_PREVIEWS)] },
    { status: 400 },
  );
}
