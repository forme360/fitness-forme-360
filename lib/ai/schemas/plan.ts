import { z } from "zod";
const JsonText = z.string().max(1000);
export const PlanProposal = z.object({
  title: z.string().min(1).max(160),
  intent: z.string().min(1).max(1000),
  duration_weeks: z.number().int().min(1).max(52),
  assumptions: z.array(JsonText).max(12),
  missing_information: z.array(JsonText).max(12),
  phases: z.array(z.object({
    name: z.string().min(1).max(100),
    focus: z.string().min(1).max(1000),
    duration_weeks: z.number().int().min(1).max(52),
    actions: z.array(z.object({
      domain: z.enum(["body","fuel","train","sleep","recover","health","mind","lifestyle","monitoring","professional_follow_up"]),
      title: z.string().min(1).max(160),
      instructions: z.string().min(1).max(1500),
      cadence: z.string().max(250),
      target: z.string().max(500),
      safety_note: JsonText.nullable(),
      evidence_refs: z.array(z.string().uuid()).max(20),
    })).min(1).max(20),
  })).min(1).max(8),
  source_evidence: z.array(z.string().uuid()).max(100),
  professional_follow_up: z.array(JsonText).max(10),
});
export type PlanProposal = z.infer<typeof PlanProposal>;
