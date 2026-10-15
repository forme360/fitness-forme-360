import { z } from "zod";

const nullableNumber = z.number().finite().nullable();
const nullableText = z.string().max(500).nullable();
export const ExtractionProposal = z.object({
  domain: z.enum(["nutrition", "training", "sleep", "recovery", "body", "health", "mood", "general"]),
  event_type: z.string().min(1).max(60),
  corrected_understanding: z.string().max(1000),
  user_facing_summary: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  requires_confirmation: z.literal(true),
  data: z.object({
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).nullable(),
    foods: z.array(z.object({ food_name: z.string().max(160), quantity: nullableNumber, unit: nullableText })),
    estimated_calories: nullableNumber,
    estimated_protein_g: nullableNumber,
    estimated_carbs_g: nullableNumber,
    estimated_fat_g: nullableNumber,
    activity_type: nullableText,
    duration_minutes: nullableNumber,
    distance_km: nullableNumber,
    training_details: nullableText,
    sleep_duration_minutes: nullableNumber,
    sleep_quality: z.number().int().min(1).max(5).nullable(),
    fatigue: z.number().int().min(1).max(10).nullable(),
    soreness: z.number().int().min(1).max(10).nullable(),
    stress: z.number().int().min(1).max(10).nullable(),
    mood_score: z.number().int().min(1).max(5).nullable(),
    mood_context: nullableText,
    weight_kg: nullableNumber,
    waist_cm: nullableNumber,
    chest_cm: nullableNumber,
    arm_cm: nullableNumber,
    thigh_cm: nullableNumber,
    hip_cm: nullableNumber,
    body_fat_percent: nullableNumber,
    note: nullableText,
  }),
});
export type ExtractionProposal = z.infer<typeof ExtractionProposal>;
export const HealthExtraction = z.object({ corrected_transcript: z.string().max(4000), events: z.array(ExtractionProposal).max(10) });
export type HealthExtraction = z.infer<typeof HealthExtraction>;
