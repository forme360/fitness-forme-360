import type { ExtractionProposal, HealthExtraction } from "@/lib/ai/schemas/extraction";

type FoodRule = { aliases: string[]; name: string; countable?: boolean };

const foodRules: FoodRule[] = [
  { aliases: ["eggs", "egg"], name: "eggs", countable: true },
  { aliases: ["rotis", "roti", "chapatis", "chapati"], name: "roti", countable: true },
  { aliases: ["bananas", "banana"], name: "banana", countable: true },
  { aliases: ["apples", "apple"], name: "apple", countable: true },
  { aliases: ["oranges", "orange"], name: "orange", countable: true },
  { aliases: ["idlis", "idli"], name: "idli", countable: true },
  { aliases: ["dosas", "dosa"], name: "dosa", countable: true },
  { aliases: ["chicken"], name: "chicken" },
  { aliases: ["rice"], name: "rice" },
  { aliases: ["dal", "daal"], name: "dal" },
  { aliases: ["paneer"], name: "paneer" },
  { aliases: ["yogurt", "curd"], name: "yogurt" },
  { aliases: ["milk"], name: "milk" },
  { aliases: ["bread"], name: "bread" },
];

const numberWords: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function amountAtStart(value: string) {
  const match = value.match(/^\s*(\d+(?:\.\d+)?|one|a|an|two|three|four|five|six|seven|eight|nine|ten)\b(?:\s*(grams?|g|kilograms?|kg|pieces?|piece|cups?|servings?)\b)?/i);
  if (!match) return null;
  const quantity = Number(match[1]) || numberWords[match[1].toLowerCase()] || null;
  const unit = match[2]?.toLowerCase() ?? null;
  return { quantity, unit };
}

function foodsFrom(text: string) {
  const items: ExtractionProposal["data"]["foods"] = [];
  const aliases = foodRules.flatMap(rule => rule.aliases).sort((a, b) => b.length - a.length);
  const regex = new RegExp(`\\b(${aliases.join("|")})\\b`, "gi");
  for (const match of text.matchAll(regex)) {
    const alias = match[1].toLowerCase();
    const rule = foodRules.find(candidate => candidate.aliases.includes(alias));
    if (!rule || items.some(item => item.food_name === rule.name)) continue;
    const before = text.slice(0, match.index);
    const after = text.slice((match.index ?? 0) + match[0].length);
    const quantity = amountAtStart(before.split(/[,;.!?\n]/).pop() ?? "") ?? amountAtStart(after);
    items.push({
      food_name: rule.name,
      quantity: quantity?.quantity ?? null,
      unit: quantity?.unit ?? (quantity && rule.countable && quantity.quantity !== null ? "piece" : null),
    });
  }
  return items;
}

function baseEvent(domain: ExtractionProposal["domain"], eventType: string, understanding: string, note: string | null): ExtractionProposal {
  return {
    domain,
    event_type: eventType,
    corrected_understanding: understanding,
    user_facing_summary: understanding,
    confidence: null,
    requires_confirmation: true,
    data: {
      meal_type: null,
      foods: [],
      estimated_calories: null,
      estimated_protein_g: null,
      estimated_carbs_g: null,
      estimated_fat_g: null,
      activity_type: null,
      duration_minutes: null,
      distance_km: null,
      training_details: null,
      sleep_duration_minutes: null,
      sleep_quality: null,
      fatigue: null,
      soreness: null,
      stress: null,
      mood_score: null,
      mood_context: null,
      weight_kg: null,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      hip_cm: null,
      body_fat_percent: null,
      note,
    },
  };
}

function parseDurationMinutes(text: string) {
  const match = text.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if (!match) return null;
  const amount = Number(match[1]) || numberWords[match[1].toLowerCase()];
  return /hours?|hrs?/i.test(match[2]) ? amount * 60 : amount;
}

function parseDistanceKm(text: string) {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?)\b/i);
  return match ? Number(match[1]) : null;
}

function clauseContaining(text: string, pattern: RegExp) {
  return text.split(/[,;.!?]|\b(?:and then|and)\b/i).map(part => part.trim()).find(part => pattern.test(part)) ?? text;
}

function formatFood(items: ExtractionProposal["data"]["foods"]) {
  return items.map(item => item.quantity === null ? item.food_name : `${item.quantity} ${item.food_name}`).join(", ");
}

export function extractLocally(input: string): HealthExtraction {
  const text = input.trim();
  const events: ExtractionProposal[] = [];
  const foods = foodsFrom(text);

  if (foods.length) {
    const meal = baseEvent("nutrition", "meal", `Meal: ${formatFood(foods)}. Nutrition values were not estimated.`, null);
    const lower = text.toLowerCase();
    meal.data.foods = foods;
    meal.data.meal_type = /\bbreakfast\b/.test(lower) ? "breakfast" : /\blunch\b/.test(lower) ? "lunch" : /\bdinner\b/.test(lower) ? "dinner" : /\bsnack\b/.test(lower) ? "snack" : "other";
    events.push(meal);
  }

  const activities = [
    { pattern: /\b(run|runs|running|ran)\b/i, type: "running" },
    { pattern: /\b(walk|walks|walking|walked)\b/i, type: "walking" },
    { pattern: /\b(cycle|cycles|cycling|cycled|bike|biked|ride|rode)\b/i, type: "cycling" },
    { pattern: /\b(swim|swims|swimming|swam)\b/i, type: "swimming" },
    { pattern: /\b(yoga|mobility|conditioning)\b/i, type: "mobility" },
    { pattern: /\b(gym|workout|trained|training|weights|strength)\b/i, type: "strength training" },
  ];
  const activity = activities.find(candidate => candidate.pattern.test(text));
  if (activity) {
    const duration = parseDurationMinutes(text);
    const distance = parseDistanceKm(text);
    const parts = [activity.type, duration === null ? null : `${duration} minutes`, distance === null ? null : `${distance} km`].filter(Boolean);
    const details = clauseContaining(text, activity.pattern);
    const event = baseEvent("training", "workout", `Workout noted: ${parts.join(" · ")}.`, null);
    event.data.activity_type = activity.type;
    event.data.duration_minutes = duration;
    event.data.distance_km = distance;
    event.data.training_details = details;
    events.push(event);
  }

  const sleepMention = /\b(slept|sleep|sleeping|sleep was|night's sleep)\b/i.test(text);
  if (sleepMention) {
    const duration = parseDurationMinutes(text);
    const details = clauseContaining(text, /\b(slept|sleep|sleeping|night's sleep)\b/i);
    const event = baseEvent("sleep", "sleep_log", duration === null ? "Sleep note recorded; no duration or quality score inferred." : `Sleep duration: ${duration} minutes.`, details);
    event.data.sleep_duration_minutes = duration;
    events.push(event);
  }

  const weight = text.match(/\b(?:weight\s*(?:is|was|of)?\s*)?(\d{2,3}(?:\.\d+)?)\s*(kg|kilograms?)\b/i);
  if (weight && /\b(weight|weigh(?:ed|ing)?|scale)\b/i.test(text)) {
    const value = Number(weight[1]);
    const event = baseEvent("body", "measurement", `User-reported weight: ${value} kg.`, null);
    event.data.weight_kg = value;
    events.push(event);
  }

  const emotion = text.match(/\b(?:i(?:'m| am| feel| felt| was| have been)\s+)?(feeling\s+)?(low|sad|upset|anxious|worried|stressed|happy|calm|overwhelmed|lonely|grieving)\b/i);
  if (emotion) {
    const context = emotion[0].trim();
    const event = baseEvent("mood", "mood_note", `Mood note: ${context}.`, null);
    event.data.mood_context = context;
    events.push(event);
  }

  const fatigueMention = /\b(fatigued|fatigue|tired|sore|soreness|stressed|stress)\b/i.test(text);
  if (fatigueMention && !events.some(event => event.domain === "mood" && event.data.mood_context?.toLowerCase().includes("stressed"))) {
    const details = clauseContaining(text, /\b(fatigued|fatigue|tired|sore|soreness|stressed|stress)\b/i);
    events.push(baseEvent("recovery", "recovery_note", "Recovery note recorded; no numeric score inferred.", details));
  }

  return {
    corrected_transcript: foods.length && /^\s*(?:eggs?|rotis?|chapatis?)\s+\d+\s*$/i.test(text)
      ? `${foods[0].quantity ?? ""} ${foods[0].food_name}`.trim()
      : text,
    events,
  };
}
