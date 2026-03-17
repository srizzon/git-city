import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { SURVEYS } from "@/lib/surveys";

// GET /api/survey?id=earcade_v1 — check if user already responded
export async function GET(req: Request) {
  const url = new URL(req.url);
  const surveyId = url.searchParams.get("id");
  if (!surveyId) return NextResponse.json({ error: "Missing survey id" }, { status: 400 });

  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ answered: false });

  const login = user.user_metadata?.user_name;
  if (!login) return NextResponse.json({ answered: false });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", login)
    .maybeSingle();

  if (!dev) return NextResponse.json({ answered: false });

  const { data: existing } = await admin
    .from("survey_responses")
    .select("answers")
    .eq("survey_id", surveyId)
    .eq("developer_id", dev.id)
    .maybeSingle();

  return NextResponse.json({ answered: !!existing, answers: existing?.answers ?? null });
}

// POST /api/survey — submit response
export async function POST(req: Request) {
  const rl = rateLimit("survey", 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const { surveyId, answers } = body as { surveyId?: string; answers?: Record<string, string> };

  if (!surveyId || !answers) {
    return NextResponse.json({ error: "Missing surveyId or answers" }, { status: 400 });
  }

  const survey = SURVEYS[surveyId];
  if (!survey) {
    return NextResponse.json({ error: "Unknown survey" }, { status: 400 });
  }

  // Validate all questions are answered with valid options
  for (const q of survey.questions) {
    const val = answers[q.key];
    if (!val || !q.options.some((o) => o.value === val)) {
      return NextResponse.json({ error: `Invalid answer for ${q.key}` }, { status: 400 });
    }
  }

  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const login = user.user_metadata?.user_name;
  if (!login) return NextResponse.json({ error: "No GitHub login" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", login)
    .maybeSingle();

  if (!dev) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

  // Insert (unique constraint prevents duplicates)
  const { error } = await admin
    .from("survey_responses")
    .insert({ survey_id: surveyId, developer_id: dev.id, answers });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already answered" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Grant XP reward
  if (survey.xpReward > 0) {
    await admin.rpc("grant_xp", {
      p_developer_id: dev.id,
      p_source: "survey",
      p_amount: survey.xpReward,
    });
  }

  return NextResponse.json({ ok: true, xp: survey.xpReward });
}
