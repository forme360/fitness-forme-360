import OpenAI from "openai";
import { NextResponse } from "next/server";
import { zodTextFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { PlanProposal } from "@/lib/ai/schemas/plan";
import { planInstructions } from "@/lib/ai/prompts/plan";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Plan generation requires a configured account." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to create a personal plan." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Plan generation is not configured yet." }, { status: 503 });

  try {
    const body = await request.json();
    if (typeof body.goalTitle !== "string" || body.goalTitle.trim().length < 3 || body.goalTitle.length > 240) return NextResponse.json({ error: "Describe a goal in 3–240 characters." }, { status: 400 });
    if (!Number.isInteger(body.durationWeeks) || body.durationWeeks < 1 || body.durationWeeks > 52) return NextResponse.json({ error: "Choose a plan duration from 1 to 52 weeks." }, { status: 400 });
    if (body.goalId != null && (typeof body.goalId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.goalId))) return NextResponse.json({ error: "Invalid goal selection." }, { status: 400 });

    const { data: existingConsent } = await supabase.from("data_consents").select("status").eq("purpose", "ai_processing").eq("provider", "openai").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingConsent?.status !== "granted") {
      if (body.aiConsent !== true) return NextResponse.json({ error: "Review and accept the AI data-use notice before generating a plan." }, { status: 403 });
      const { error: consentError } = await supabase.from("data_consents").insert({ user_id: user.id, purpose: "ai_processing", provider: "openai", data_categories: ["profile_context", "goals", "body_measurements", "training_sessions", "nutrition_logs", "sleep_logs", "recovery_logs", "mood_logs", "injury_records"], status: "granted", policy_version: "ai-plan-v1", granted_at: new Date().toISOString() });
      if (consentError) return NextResponse.json({ error: "Could not record your AI data-use choice. Apply the latest database migrations and try again." }, { status: 503 });
    }

    const { data: goal, error: goalError } = body.goalId ? await supabase.from("goals").select("id,domain,title,target,unit,starts_on,ends_on,status").eq("id", body.goalId).eq("user_id", user.id).maybeSingle() : { data: null, error: null };
    if (goalError || (body.goalId && !goal)) return NextResponse.json({ error: "That goal was not found in your account." }, { status: 404 });
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [context, measurements, training, nutrition, sleep, recovery, mood, injuries] = await Promise.all([
      supabase.from("profile_context").select("birth_date,height_cm,sex_at_birth,training_experience,available_training_days,preferred_session_minutes,available_equipment,dietary_preferences,allergies_and_intolerances,preferred_language").eq("user_id", user.id).maybeSingle(),
      supabase.from("body_measurements").select("id,measured_at,weight_kg,waist_cm,chest_cm,body_fat_percent,provenance").gte("measured_at", since).order("measured_at", { ascending: false }).limit(20),
      supabase.from("training_sessions").select("id,started_at,activity_type,duration_minutes,distance_km,notes,provenance").gte("started_at", since).order("started_at", { ascending: false }).limit(30),
      supabase.from("nutrition_logs").select("id,logged_at,meal_type,calories,protein_g,carbs_g,fat_g,provenance").gte("logged_at", since).order("logged_at", { ascending: false }).limit(30),
      supabase.from("sleep_logs").select("id,sleep_date,duration_minutes,quality,source,provenance").gte("sleep_date", since.slice(0,10)).order("sleep_date", { ascending: false }).limit(30),
      supabase.from("recovery_logs").select("id,logged_at,fatigue,soreness,stress,recovery_score,provenance").gte("logged_at", since).order("logged_at", { ascending: false }).limit(30),
      supabase.from("mood_logs").select("id,logged_at,mood,stress,provenance").gte("logged_at", since).order("logged_at", { ascending: false }).limit(20),
      supabase.from("injury_records").select("id,body_region,status,activity_restrictions,clinician_guidance,provenance").in("status", ["current","recovering"]).limit(20),
    ]);
    const errors = [context, measurements, training, nutrition, sleep, recovery, mood, injuries].filter(result => result.error);
    if (errors.length) return NextResponse.json({ error: "Could not read the current health model. Apply the latest Supabase migrations and try again." }, { status: 503 });
    const evidence = [...(measurements.data ?? []), ...(training.data ?? []), ...(nutrition.data ?? []), ...(sleep.data ?? []), ...(recovery.data ?? []), ...(mood.data ?? []), ...(injuries.data ?? [])].map(row => ({ id: row.id, source: "user_record" }));
    const allowedIds = new Set(evidence.map(item => item.id));
    const userContext = { requested_goal: goal ?? { title: body.goalTitle.trim() }, requested_duration_weeks: body.durationWeeks, optional_profile_context: context.data, recent_user_records_90d: { body_measurements: measurements.data, training: training.data, nutrition: nutrition.data, sleep: sleep.data, recovery: recovery.data, mood: mood.data, active_injuries_and_user_provided_restrictions: injuries.data }, evidence_index: evidence };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({ model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini", instructions: planInstructions, input: JSON.stringify(userContext), text: { format: zodTextFormat(PlanProposal, "personal_plan_proposal") } });
    const proposal = response.output_parsed;
    if (!proposal) return NextResponse.json({ error: "Could not draft a plan. Try simplifying your goal." }, { status: 422 });
    const safeProposal = { ...proposal, source_evidence: proposal.source_evidence.filter(id => allowedIds.has(id)), phases: proposal.phases.map(phase => ({ ...phase, actions: phase.actions.map(action => ({ ...action, evidence_refs: action.evidence_refs.filter(id => allowedIds.has(id)) })) })) };
    return NextResponse.json({ proposal: safeProposal });
  } catch {
    return NextResponse.json({ error: "Could not draft the plan. Please try again." }, { status: 500 });
  }
}
