import OpenAI from "openai";
import { NextResponse } from "next/server";
import { zodTextFormat } from "openai/helpers/zod";
import { HealthExtraction } from "@/lib/ai/schemas/extraction";
import { extractionInstructions } from "@/lib/ai/prompts/extraction";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "AI extraction requires a configured account." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use AI Coach." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI Coach is not configured yet." }, { status: 503 });
  try {
    const body = await request.json();
    if (typeof body.text !== "string" || body.text.trim().length < 2 || body.text.length > 4000) return NextResponse.json({ error: "Enter a note between 2 and 4000 characters." }, { status: 400 });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({ model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini", instructions: extractionInstructions, input: body.text, text: { format: zodTextFormat(HealthExtraction, "health_extraction_proposals") } });
    const extraction = response.output_parsed;
    if (!extraction || extraction.events.length === 0) return NextResponse.json({ error: "I could not identify a clear health entry. Try describing one update more specifically." }, { status: 422 });
    return NextResponse.json({ extraction });
  } catch {
    return NextResponse.json({ error: "Could not process your note. Please try again." }, { status: 500 });
  }
}
