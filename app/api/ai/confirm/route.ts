import { NextResponse } from "next/server";
import { ExtractionProposal } from "@/lib/ai/schemas/extraction";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Persistent saving requires a configured account." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in before saving a confirmed entry." }, { status: 401 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const checked = ExtractionProposal.safeParse((payload as { proposal?: unknown })?.proposal);
  if (!checked.success) return NextResponse.json({ error: "The reviewed draft is invalid. Please review it again." }, { status: 400 });
  const { domain, data } = checked.data;
  let result: { data: { id: string } | null; error: { message: string } | null };
  if (domain === "nutrition") {
    if (!data.foods.length) return NextResponse.json({ error: "Add at least one food before saving this meal." }, { status: 400 });
    const hasEstimates = [data.estimated_calories, data.estimated_protein_g, data.estimated_carbs_g, data.estimated_fat_g].some(v => v !== null);
    const logged = await supabase.rpc("save_confirmed_meal", { _meal_type: data.meal_type ?? "other", _notes: data.note ?? checked.data.corrected_understanding, _calories: data.estimated_calories, _protein_g: data.estimated_protein_g, _carbs_g: data.estimated_carbs_g, _fat_g: data.estimated_fat_g, _provenance: hasEstimates ? "ESTIMATED" : "USER_PROVIDED", _foods: data.foods });
    result = logged.error || !logged.data ? { data: null, error: logged.error ?? { message: "Meal insert returned no id" } } : { data: { id: logged.data as string }, error: null };
  } else if (domain === "training") {
    if (!data.activity_type) return NextResponse.json({ error: "Choose the activity type before saving." }, { status: 400 });
    result = await supabase.from("training_sessions").insert({ user_id: user.id, activity_type: data.activity_type, duration_minutes: data.duration_minutes, distance_km: data.distance_km, notes: data.training_details ?? data.note, provenance: "USER_PROVIDED", confirmed_at: new Date().toISOString() }).select("id").single();
  } else if (domain === "sleep") {
    if (data.sleep_duration_minutes === null && data.sleep_quality === null) return NextResponse.json({ error: "Add sleep duration or quality before saving." }, { status: 400 });
    result = await supabase.from("sleep_logs").insert({ user_id: user.id, sleep_date: new Date().toISOString().slice(0, 10), duration_minutes: data.sleep_duration_minutes, quality: data.sleep_quality, source: "manual_ai", notes: data.note, provenance: "USER_PROVIDED", confirmed_at: new Date().toISOString() }).select("id").single();
  } else if (domain === "recovery") {
    if ([data.fatigue, data.soreness, data.stress].every(v => v === null)) return NextResponse.json({ error: "Add a recovery value before saving." }, { status: 400 });
    result = await supabase.from("recovery_logs").insert({ user_id: user.id, fatigue: data.fatigue, soreness: data.soreness, stress: data.stress, notes: data.note, provenance: "USER_PROVIDED" }).select("id").single();
  } else if (domain === "mood") {
    if (data.mood_score === null && data.stress === null && !data.mood_context && !data.note) return NextResponse.json({ error: "Add a mood or context note before saving." }, { status: 400 });
    result = await supabase.from("mood_logs").insert({ user_id: user.id, mood: data.mood_score, stress: data.stress, note: [data.mood_context, data.note].filter(Boolean).join(" · ") || null, provenance: "USER_PROVIDED" }).select("id").single();
  } else if (domain === "body") {
    const fields = { weight_kg: data.weight_kg, waist_cm: data.waist_cm, chest_cm: data.chest_cm, arm_cm: data.arm_cm, thigh_cm: data.thigh_cm, hip_cm: data.hip_cm, body_fat_percent: data.body_fat_percent };
    if (Object.values(fields).every(v => v === null)) return NextResponse.json({ error: "Add a measurement before saving." }, { status: 400 });
    if (data.body_fat_percent !== null && (data.body_fat_percent < 1 || data.body_fat_percent > 75)) return NextResponse.json({ error: "Check the body-fat value. Only save a value you measured yourself." }, { status: 400 });
    result = await supabase.from("body_measurements").insert({ user_id: user.id, ...fields, body_fat_provenance: data.body_fat_percent === null ? null : "USER_PROVIDED", provenance: "USER_PROVIDED", notes: data.note }).select("id").single();
  } else if (domain === "health") {
    return NextResponse.json({ error: "For safety, lab results must be reviewed against and saved with the uploaded source report. Upload the report in Health Vault first." }, { status: 422 });
  } else {
    return NextResponse.json({ error: "This note does not contain a saveable health entry. You can keep it as a conversation note in a future release." }, { status: 422 });
  }
  if (result.error || !result.data) return NextResponse.json({ error: "Could not save this entry. No other health data was changed." }, { status: 500 });
  return NextResponse.json({ saved: true, recordId: result.data.id });
}
