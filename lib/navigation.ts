export const modules = [
  { key: "today", label: "Today" },
  { key: "coach", label: "Ask AI" },
  { key: "plan", label: "Plan" },
  { key: "nutrition", label: "Fuel" },
  { key: "training", label: "Train" },
  { key: "sleep", label: "Sleep" },
  { key: "recovery", label: "Recover" },
  { key: "body", label: "Body" },
  { key: "health", label: "Health & Biology" },
  { key: "mind", label: "Mind" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "timeline", label: "Timeline" },
  { key: "insights", label: "Insights" },
  { key: "integrations", label: "Connections" },
  { key: "social", label: "Social" },
  { key: "profile", label: "My Health Model" },
] as const;

export type NavigationKey = typeof modules[number]["key"];
