import { describe, expect, it } from "vitest";
import { AQI_CATEGORIES, categorize } from "@/lib/air-quality";
import { buildFallbackAdvice } from "@/lib/fallback";
import {
  COMMUTE_OPTIONS,
  COOKING_FUEL_OPTIONS,
  HEATING_FUEL_OPTIONS,
  HOME_OPTIONS,
} from "@/lib/options";
import { adviceSchema } from "@/lib/schemas";
import { profile, snapshot } from "../fixtures";

const snapshotAt = (usAqi: number) => ({ ...snapshot, usAqi, category: categorize(usAqi) });

describe("buildFallbackAdvice", () => {
  it("always satisfies the advice schema across profiles and AQI levels", () => {
    const snapshots = [null, ...AQI_CATEGORIES.map((c) => snapshotAt(c.max))];
    for (const commute of COMMUTE_OPTIONS)
      for (const cooking of COOKING_FUEL_OPTIONS)
        for (const heating of HEATING_FUEL_OPTIONS)
          for (const home of HOME_OPTIONS)
            for (const sensitive of [false, true])
              for (const current of snapshots) {
                const advice = buildFallbackAdvice(
                  {
                    ...profile,
                    commute: commute.value,
                    cookingFuel: cooking.value,
                    heatingFuel: heating.value,
                    home: home.value,
                    hasChildren: sensitive,
                    conditions: [],
                  },
                  current,
                );
                expect(adviceSchema.safeParse(advice).success).toBe(true);
              }
  });

  it("recommends a respirator when the air is hazardous", () => {
    const advice = buildFallbackAdvice(profile, snapshotAt(350));
    expect(advice.routine.some((s) => s.title.includes("N95"))).toBe(true);
    expect(advice.snapshotSummary).toContain("AQI 350");
    expect(advice.snapshotSummary).toContain("sensitive members");
  });

  it("is relaxed when the air is good for a non-sensitive household", () => {
    const advice = buildFallbackAdvice(
      { ...profile, hasChildren: false, conditions: [] },
      snapshotAt(20),
    );
    expect(advice.routine.some((s) => s.title.includes("N95"))).toBe(false);
    expect(advice.routine).toHaveLength(3);
    expect(advice.snapshotSummary).not.toContain("sensitive");
  });

  it("is cautious and says so when live data is missing", () => {
    const advice = buildFallbackAdvice(profile, null);
    expect(advice.snapshotSummary).toContain("unavailable");
    expect(advice.routine.some((s) => s.title.includes("N95"))).toBe(true);
  });

  it("tailors fuel advice to the household", () => {
    const advice = buildFallbackAdvice(
      { ...profile, cookingFuel: "biomass", heatingFuel: "coal", commute: "walk" },
      snapshot,
    );
    const titles = [...advice.indoorHacks, ...advice.alternatives].map((s) => s.title).join("|");
    expect(titles).toContain("Vent cooking smoke");
    expect(titles).toContain("Avoid burning solid fuel");
    expect(titles).toContain("LPG or induction");
    expect(titles).toContain("electric heater");
    expect(advice.alternatives[0]?.title).toContain("Keep your low-emission commute");
  });
});
