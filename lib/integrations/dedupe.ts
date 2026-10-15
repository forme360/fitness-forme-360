export type ActivitySourceEvent = {
  activityType: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
};
export type DuplicateAssessment = "distinct" | "duplicate_candidate" | "review_required";

/**
 * Cross-provider match only: events are never summed here. Close, overlapping
 * records with conflicting distances are held for review rather than counted twice.
 */
export function assessActivityOverlap(a: ActivitySourceEvent, b: ActivitySourceEvent): DuplicateAssessment {
  const typeA = a.activityType.trim().toLowerCase();
  const typeB = b.activityType.trim().toLowerCase();
  const synonyms: Record<string, string> = { run: "running", jog: "running", walk: "walking", hike: "hiking", ride: "cycling", bike: "cycling" };
  if ((synonyms[typeA] ?? typeA) !== (synonyms[typeB] ?? typeB)) return "distinct";
  const startA = Date.parse(a.startedAt), startB = Date.parse(b.startedAt);
  if (!Number.isFinite(startA) || !Number.isFinite(startB)) return "review_required";
  const startDelta = Math.abs(startA - startB) / 1000;
  const durationA = Math.max(0, a.durationSeconds ?? 0), durationB = Math.max(0, b.durationSeconds ?? 0);
  const endA = a.endedAt ? Date.parse(a.endedAt) : startA + durationA * 1000;
  const endB = b.endedAt ? Date.parse(b.endedAt) : startB + durationB * 1000;
  const shorter = Math.min(endA - startA, endB - startB);
  const overlap = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  const overlapRatio = shorter > 0 ? overlap / shorter : 0;
  const sameStart = startDelta <= 180;
  const overlapping = overlapRatio >= 0.7;
  if (!sameStart && !overlapping) return "distinct";
  if (a.distanceMeters == null || b.distanceMeters == null || Math.min(a.distanceMeters, b.distanceMeters) <= 0) return overlapping || sameStart ? "review_required" : "distinct";
  const distanceDelta = Math.abs(a.distanceMeters - b.distanceMeters) / Math.max(a.distanceMeters, b.distanceMeters);
  if (distanceDelta <= 0.2) return "duplicate_candidate";
  return overlapping || sameStart ? "review_required" : "distinct";
}
