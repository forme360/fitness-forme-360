import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to load your private dashboard." }, { status: 401 });

  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const weekStart = url.searchParams.get("weekStart") ?? "";
  const weekStartIso = url.searchParams.get("weekStartIso") ?? "";
  const timezone = url.searchParams.get("timezone") ?? "UTC";
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const weekStartMs = Date.parse(weekStartIso);
  const duration = endMs - startMs;

  let dateFormatter: Intl.DateTimeFormat;
  try { dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return NextResponse.json({ error: "The requested timezone is invalid." }, { status: 400 }); }
  if (!dayPattern.test(day) || !dayPattern.test(weekStart) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(weekStartMs) || duration < 20 * 60 * 60 * 1000 || duration > 28 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "The requested local day is invalid." }, { status: 400 });
  }
  const localDate = (value: string | Date) => {
    if (typeof value === "string" && dayPattern.test(value)) return value;
    const parts = dateFormatter.formatToParts(typeof value === "string" ? new Date(value) : value);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };

  const previousDay = new Date(`${day}T12:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const previousDayLabel = previousDay.toISOString().slice(0, 10);

  const [sleepResult, trainingResult, nutritionResult, weightResult, recoveryResult, moodResult] = await Promise.all([
    supabase.from("sleep_logs").select("duration_minutes,quality,sleep_date").eq("user_id", user.id).gte("sleep_date", previousDayLabel).lte("sleep_date", day).order("sleep_date", { ascending: false }).limit(1),
    supabase.from("training_sessions").select("duration_minutes").eq("user_id", user.id).gte("started_at", start).lt("started_at", end),
    supabase.from("nutrition_logs").select("calories,protein_g,carbs_g,fat_g,provenance").eq("user_id", user.id).gte("logged_at", start).lt("logged_at", end),
    supabase.from("body_measurements").select("weight_kg,measured_at").eq("user_id", user.id).not("weight_kg", "is", null).order("measured_at", { ascending: false }).limit(1),
    supabase.from("recovery_logs").select("id,logged_at,fatigue,soreness,stress").eq("user_id", user.id).gte("logged_at", weekStartIso).lt("logged_at", end),
    supabase.from("mood_logs").select("id,logged_at,mood,stress").eq("user_id", user.id).gte("logged_at", weekStartIso).lt("logged_at", end),
  ]);

  const [weekSleep, weekTraining, weekNutrition, weekBody] = await Promise.all([
    supabase.from("sleep_logs").select("sleep_date,duration_minutes").eq("user_id", user.id).gte("sleep_date", weekStart).lte("sleep_date", day),
    supabase.from("training_sessions").select("id,activity_type,started_at,duration_minutes,distance_km").eq("user_id", user.id).gte("started_at", weekStartIso).lt("started_at", end),
    supabase.from("nutrition_logs").select("id,logged_at,meal_type,notes,calories,protein_g,carbs_g,fat_g,provenance").eq("user_id", user.id).gte("logged_at", weekStartIso).lt("logged_at", end),
    supabase.from("body_measurements").select("id,measured_at,weight_kg,waist_cm").eq("user_id", user.id).gte("measured_at", weekStartIso).lt("measured_at", end),
  ]);
  const results = [sleepResult, trainingResult, nutritionResult, weightResult, recoveryResult, moodResult, weekSleep, weekTraining, weekNutrition, weekBody];
  if (results.some(result => result.error)) {
    return NextResponse.json({ error: "Could not load your saved dashboard records. Check that the Supabase migrations are applied." }, { status: 503 });
  }

  const sleep = sleepResult.data?.[0];
  const training = trainingResult.data ?? [];
  const meals = nutritionResult.data ?? [];
  const weight = weightResult.data?.[0];
  const sumKnown = (key: "calories" | "protein_g" | "carbs_g" | "fat_g") => {
    const values = meals.map(row => row[key]).filter(value => value !== null).map(Number);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };

  const days: Array<{day:string;sleepMinutes:number|null;trainingMinutes:number|null;proteinGrams:number|null;weightKg:number|null}> = [];
  const cursor = new Date(`${weekStart}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const key = cursor.toISOString().slice(0, 10);
    const nutritionRows = (weekNutrition.data ?? []).filter(row => localDate(row.logged_at) === key);
    const trainingRows = (weekTraining.data ?? []).filter(row => localDate(row.started_at) === key);
    const sleepRows = (weekSleep.data ?? []).filter(row => row.sleep_date === key);
    const bodyRows = (weekBody.data ?? []).filter(row => localDate(row.measured_at) === key && row.weight_kg !== null);
    const protein = nutritionRows.map(row => row.protein_g).filter(value => value !== null).map(Number);
    const minutes = trainingRows.map(row => row.duration_minutes).filter(value => value !== null).map(Number);
    const latestBody = bodyRows.sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at))[0];
    days.push({
      day: key,
      sleepMinutes: sleepRows.length ? (sleepRows.at(-1)?.duration_minutes ?? null) : null,
      trainingMinutes: minutes.length ? minutes.reduce((sum, value) => sum + value, 0) : null,
      proteinGrams: protein.length ? protein.reduce((sum, value) => sum + value, 0) : null,
      weightKg: latestBody?.weight_kg === undefined ? null : Number(latestBody.weight_kg),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const recentActivity = [
    ...(weekNutrition.data ?? []).map(row => ({ id: row.id, at: row.logged_at, domain: "Nutrition", title: `${row.meal_type} · meal`, detail: String(row.notes ?? "Saved nutrition entry"), source: "User record" })),
    ...(weekTraining.data ?? []).map(row => ({ id: row.id, at: row.started_at, domain: "Training", title: String(row.activity_type), detail: [row.duration_minutes ? `${row.duration_minutes} min` : "", row.distance_km ? `${row.distance_km} km` : ""].filter(Boolean).join(" · ") || "Saved workout", source: "User record" })),
    ...(weekSleep.data ?? []).map(row => ({ id: row.sleep_date, at: `${row.sleep_date}T12:00:00.000Z`, domain: "Sleep", title: "Sleep log", detail: row.duration_minutes === null ? "Sleep entry" : `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m`, source: "User record" })),
    ...(weekBody.data ?? []).map(row => ({ id: row.id, at: row.measured_at, domain: "Body", title: "Measurement", detail: [row.weight_kg !== null ? `${row.weight_kg} kg` : "", row.waist_cm !== null ? `${row.waist_cm} cm waist` : ""].filter(Boolean).join(" · ") || "Saved measurement", source: "User record" })),
    ...(recoveryResult.data ?? []).map(row => ({ id: row.id, at: row.logged_at, domain: "Recovery", title: "Recovery check-in", detail: [row.fatigue !== null ? `Fatigue ${row.fatigue}/10` : "", row.soreness !== null ? `Soreness ${row.soreness}/10` : "", row.stress !== null ? `Stress ${row.stress}/10` : ""].filter(Boolean).join(" · ") || "Saved check-in", source: "User record" })),
    ...(moodResult.data ?? []).map(row => ({ id: row.id, at: row.logged_at, domain: "Mood", title: "Mood check-in", detail: [row.mood !== null ? "Mood score saved" : "", row.stress !== null ? `Stress ${row.stress}/10` : ""].filter(Boolean).join(" · ") || "Saved check-in", source: "User record" })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6).map(row => ({ ...row, day: localDate(row.at) }));

  return NextResponse.json({
    sleep: { durationMinutes: sleep?.duration_minutes ?? null, quality: sleep?.quality ?? null, date: sleep?.sleep_date ?? null },
    training: { durationMinutes: training.reduce((total, row) => total + (Number(row.duration_minutes) || 0), 0), sessionCount: training.length },
    nutrition: { calories: sumKnown("calories"), proteinGrams: sumKnown("protein_g"), carbsGrams: sumKnown("carbs_g"), fatGrams: sumKnown("fat_g"), mealCount: meals.length, estimated: meals.some(row => row.provenance === "ESTIMATED") },
    weight: { kilograms: weight?.weight_kg ?? null, measuredAt: weight?.measured_at ?? null },
    days,
    recentActivity,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
