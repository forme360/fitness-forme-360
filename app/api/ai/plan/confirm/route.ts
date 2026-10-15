import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PlanProposal } from "@/lib/ai/schemas/plan";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Saving plans requires a configured account." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in before saving a plan." }, { status: 401 });
  let body: { proposal?: unknown; goalId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const checked = PlanProposal.safeParse(body.proposal);
  if (!checked.success) return NextResponse.json({ error: "The plan draft is invalid. Review it again." }, { status: 400 });
  if (body.goalId != null && (typeof body.goalId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.goalId))) return NextResponse.json({ error: "Invalid goal selection." }, { status: 400 });
  const startsOn = new Date().toISOString().slice(0, 10);
  const endsOn = new Date(Date.now() + checked.data.duration_weeks * 7 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("save_confirmed_plan", {
    _goal_id: body.goalId ?? null,
    _title: checked.data.title,
    _intent: checked.data.intent,
    _starts_on: startsOn,
    _target_date: endsOn,
    _assumptions: checked.data.assumptions,
    _missing_information: checked.data.missing_information,
    _source_evidence: checked.data.source_evidence,
    _phases: checked.data.phases,
  });
  if (error || !data) return NextResponse.json({ error: "Could not save the confirmed plan. Your existing records were not changed." }, { status: 500 });
  return NextResponse.json({ saved: true, planId: data });
}
