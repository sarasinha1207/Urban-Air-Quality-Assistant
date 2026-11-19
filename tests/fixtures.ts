import type { AdviceResponse } from "@/lib/advice-service";
import { categorize, type AirSnapshot } from "@/lib/air-quality";
import type { Advice, Profile, Suggestion } from "@/lib/schemas";

export const profile: Profile = {
  location: { kind: "query", query: "Delhi" },
  hasChildren: true,
  hasElderly: false,
  conditions: ["respiratory"],
  commute: "car",
  home: "apartment",
  cookingFuel: "lpg_or_gas",
  heatingFuel: "electric",
};

export const snapshot: AirSnapshot = {
  usAqi: 312,
  pm25: 180.4,
  pm10: 240,
  whoMultiple: 12,
  category: categorize(312),
  observedAt: "2026-11-18T08:00",
};

const suggestion = (n: number): Suggestion => ({
  title: `Tip ${n}`,
  detail: "Do this today.",
  impact: `Cuts exposure by about ${n}0%.`,
});

export const advice: Advice = {
  snapshotSummary: "The air is hazardous today.",
  routine: [suggestion(1), suggestion(2), suggestion(3)],
  indoorHacks: [suggestion(4), suggestion(5), suggestion(6)],
  alternatives: [suggestion(7), suggestion(8), suggestion(9)],
};

export const adviceResponse: AdviceResponse = {
  placeName: "Delhi, India",
  snapshot,
  advice,
  source: "ai",
  notices: [],
};
