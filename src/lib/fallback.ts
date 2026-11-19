import { WHO_PM25_DAILY_GUIDELINE, type AirSnapshot } from "./air-quality";
import { AQI_LEVEL } from "./aqi-levels";
import {
  CLOSE_WINDOWS,
  COMMUTE_TIPS,
  COOKING_SWAP,
  COOKING_VENTILATION,
  HEATING_INDOORS,
  HEATING_SWAP,
  MASK_OR_CHECK,
  OUTDOOR_TIME,
  PROTECT_SENSITIVE,
  PURIFIER_OR_CLEAN_ROOM,
  TRIP_SWAP,
  type Variants,
} from "./fallback-content";
import type { Advice, Profile, Suggestion } from "./schemas";

/** Without live data, plan as if the air were unhealthy: the safe assumption. */
const PRECAUTIONARY_LEVEL = AQI_LEVEL.UNHEALTHY;
const SOLID_COOKING_FUELS: ReadonlySet<string> = new Set(["biomass", "coal", "kerosene"]);
const SOLID_HEATING_FUELS: ReadonlySet<string> = new Set(["biomass", "coal"]);
const MOTORISED_COMMUTES: ReadonlySet<string> = new Set(["car", "motorbike"]);
const NO_READING_SUMMARY =
  "Live air-quality data is unavailable right now, so this plan is precautionary winter-smog guidance for your household.";

/** The household and air facts that decide which suggestions apply. */
interface Traits {
  sensitive: boolean;
  restrictOutdoors: boolean;
  solidCooking: boolean;
  solidHeating: boolean;
  motorised: boolean;
  sharedRoom: boolean;
}

function traitsOf(profile: Profile, level: number): Traits {
  const sensitive = profile.hasChildren || profile.hasElderly || profile.conditions.length > 0;
  return {
    sensitive,
    restrictOutdoors: level >= AQI_LEVEL.UNHEALTHY || (sensitive && level >= AQI_LEVEL.SENSITIVE),
    solidCooking: SOLID_COOKING_FUELS.has(profile.cookingFuel),
    solidHeating: SOLID_HEATING_FUELS.has(profile.heatingFuel),
    motorised: MOTORISED_COMMUTES.has(profile.commute),
    sharedRoom: profile.home === "shared_room",
  };
}

const pick = ({ yes, no }: Variants, flag: boolean): Suggestion => (flag ? yes : no);

function summarize(snapshot: AirSnapshot | null, sensitive: boolean): string {
  if (!snapshot) return NO_READING_SUMMARY;
  const base = `AQI ${snapshot.usAqi} (${snapshot.category.label}): PM2.5 is ${snapshot.pm25} µg/m³, about ${snapshot.whoMultiple}× the WHO daily guideline of ${WHO_PM25_DAILY_GUIDELINE} µg/m³.`;
  const needsExtraCare = sensitive && snapshot.category.level >= AQI_LEVEL.SENSITIVE;
  return needsExtraCare
    ? `${base} Your household includes sensitive members, so take extra care today.`
    : base;
}

function routineFor(profile: Profile, t: Traits): Suggestion[] {
  const routine = [
    COMMUTE_TIPS[profile.commute],
    pick(OUTDOOR_TIME, t.restrictOutdoors),
    pick(MASK_OR_CHECK, t.restrictOutdoors),
  ];
  return t.sensitive ? [...routine, PROTECT_SENSITIVE] : routine;
}

function indoorHacksFor(t: Traits): Suggestion[] {
  return [
    CLOSE_WINDOWS,
    pick(PURIFIER_OR_CLEAN_ROOM, t.sharedRoom),
    pick(COOKING_VENTILATION, t.solidCooking),
    pick(HEATING_INDOORS, t.solidHeating),
  ];
}

function alternativesFor(t: Traits): Suggestion[] {
  return [
    pick(TRIP_SWAP, t.motorised),
    pick(COOKING_SWAP, t.solidCooking),
    pick(HEATING_SWAP, t.solidHeating),
  ];
}

/**
 * Rule-based plan used when Gemini is unavailable. It is deterministic, tailored to the same
 * profile fields, and always satisfies the advice schema so the UI needs no special case.
 * @param profile - Validated household profile.
 * @param snapshot - Live air readings, or `null` when unavailable (treated cautiously).
 * @returns Schema-valid advice.
 */
export function buildFallbackAdvice(profile: Profile, snapshot: AirSnapshot | null): Advice {
  const traits = traitsOf(profile, snapshot?.category.level ?? PRECAUTIONARY_LEVEL);
  return {
    snapshotSummary: summarize(snapshot, traits.sensitive),
    routine: routineFor(profile, traits),
    indoorHacks: indoorHacksFor(traits),
    alternatives: alternativesFor(traits),
  };
}
