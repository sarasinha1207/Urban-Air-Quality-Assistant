import type { AirSnapshot } from "./aqi";
import type { Advice, Profile, Suggestion } from "./schemas";

const COMMUTE_TIPS: Record<Profile["commute"], Suggestion> = {
  walk: {
    title: "Walk on side streets, away from main roads",
    detail: "Pick quiet lanes or park paths and avoid the 7–10 am and 5–8 pm traffic peaks.",
    impact: "Staying a few streets back from heavy traffic can cut your exposure by about 20–40%.",
  },
  bicycle: {
    title: "Cycle on low-traffic routes and off-peak",
    detail:
      "Use back streets or cycle paths and ride mid-morning or early afternoon instead of rush hour.",
    impact: "Off-peak, low-traffic routes can lower the PM2.5 you inhale by roughly 20–40%.",
  },
  public_transit: {
    title: "Keep taking public transport",
    detail:
      "Wait inside stations or shelters away from the kerb and wear a fitted mask on crowded days.",
    impact: "Each trip emits roughly 50–70% less CO2 per person than driving alone.",
  },
  car: {
    title: "Recirculate cabin air and combine trips",
    detail:
      "Use recirculate mode with windows shut in traffic and bundle errands into a single trip.",
    impact:
      "Recirculation can cut in-car PM2.5 by about 40–60%; one fewer 10 km trip avoids about 1.7 kg CO2.",
  },
  motorbike: {
    title: "Ride with a fitted respirator and visor down",
    detail: "Wear an N95/FFP2 under a full-face helmet and try the metro or bus on the worst days.",
    impact: "A well-sealed N95/FFP2 filters about 95% of fine particles.",
  },
  work_from_home: {
    title: "Skip the commute and step out only at midday",
    detail:
      "Do essential errands in the afternoon when the air mixes best and combine them into one outing.",
    impact:
      "Skipping a 10 km car commute avoids about 1.7 kg CO2 and rush-hour smog exposure each day.",
  },
};

const BIOMASS_LIKE = new Set(["biomass", "coal", "kerosene"]);

function summarize(snapshot: AirSnapshot | null, sensitive: boolean): string {
  if (!snapshot) {
    return "Live air-quality data is unavailable right now, so this plan is precautionary winter-smog guidance for your household.";
  }
  const base = `AQI ${snapshot.usAqi} (${snapshot.category.label}): PM2.5 is ${snapshot.pm25} µg/m³, about ${snapshot.whoMultiple}× the WHO daily guideline of 15 µg/m³.`;
  return sensitive && snapshot.category.level >= 2
    ? `${base} Your household includes sensitive members, so take extra care today.`
    : base;
}

/**
 * Rule-based plan used when Gemini is unavailable. It is deterministic, tailored to the same
 * profile fields, and always satisfies the advice schema so the UI needs no special case.
 * @param profile - Validated household profile.
 * @param snapshot - Live air readings, or `null` when unavailable (treated cautiously).
 * @returns Schema-valid advice.
 */
export function buildFallbackAdvice(profile: Profile, snapshot: AirSnapshot | null): Advice {
  const level = snapshot?.category.level ?? 3;
  const sensitive = profile.hasChildren || profile.hasElderly || profile.conditions.length > 0;
  const restrictOutdoors = level >= 3 || (sensitive && level >= 2);
  const solidCooking = BIOMASS_LIKE.has(profile.cookingFuel);
  const solidHeating = profile.heatingFuel === "biomass" || profile.heatingFuel === "coal";
  const motorised = profile.commute === "car" || profile.commute === "motorbike";

  const routine: Suggestion[] = [
    COMMUTE_TIPS[profile.commute],
    {
      title: restrictOutdoors
        ? "Keep outdoor time short and in the afternoon"
        : "Exercise in the afternoon, away from traffic",
      detail: restrictOutdoors
        ? "Move exercise and children's play indoors today and run errands when the air mixes best."
        : "Choose parks or quiet streets after midday rather than the morning and evening peaks.",
      impact: "Moving activity out of rush hour can lower the PM2.5 you breathe by about 20–30%.",
    },
    restrictOutdoors
      ? {
          title: "Wear a fitted N95/FFP2 for essential trips outdoors",
          detail:
            "Check the seal around nose and chin; cloth and surgical masks filter far less fine dust.",
          impact: "A well-sealed N95/FFP2 filters about 95% of fine particles.",
        }
      : {
          title: "Check the air reading before you head out",
          detail:
            "Look at the AQI 5 minutes before leaving and shift outdoor plans if it climbs past 100.",
          impact: "Planning around a 100+ AQI can avoid the worst 2–3 hours of the day.",
        },
  ];
  if (sensitive) {
    routine.push({
      title: "Protect children, older adults and anyone with lung or heart conditions",
      detail:
        "Keep them indoors at the morning and evening peaks, keep prescribed medication handy and follow their doctor's plan.",
      impact: "Winter morning and evening PM2.5 is often 1.5–2× midday levels in many cities.",
    });
  }

  const indoorHacks: Suggestion[] = [
    {
      title: "Close windows at peak hours; air out briefly at midday",
      detail:
        "Keep windows shut in the morning and evening and open them for 10 minutes when the reading is lowest.",
      impact: "Closed windows can cut indoor PM2.5 by roughly 30–60% compared with open ones.",
    },
    {
      title:
        profile.home === "shared_room"
          ? "Make one room your clean room"
          : "Run a HEPA purifier in the bedroom",
      detail:
        profile.home === "shared_room"
          ? "Seal gaps in one room, run a purifier there and let everyone rest in it; a box fan with a filter is a budget option."
          : "Size it for the room, run it high while cooking and low overnight; a box fan with a filter is a budget option.",
      impact: "A correctly sized HEPA purifier can cut room PM2.5 by about 50–80%.",
    },
    solidCooking
      ? {
          title: "Vent cooking smoke outdoors",
          detail:
            "Cook beside an open window or under a chimney or hood, use lids and keep children out of the kitchen.",
          impact: "Good ventilation can cut kitchen PM2.5 by roughly 30–70%.",
        }
      : {
          title: "Use the extractor hood or fan while cooking",
          detail:
            "Switch it on before you start and leave it running a few minutes after you finish.",
          impact: "A hood vented outdoors can remove about 50–70% of cooking particles.",
        },
    solidHeating
      ? {
          title: "Avoid burning solid fuel indoors on smog days",
          detail:
            "Use an electric heater or extra layers; if you must burn, use a flued stove and dry fuel.",
          impact: "Indoor solid-fuel burning can raise indoor PM2.5 roughly 3–10 times.",
        }
      : {
          title: "Seal draughts around doors and windows",
          detail: "Weatherstrip gaps so heat stays in and smog stays out.",
          impact:
            "Draught-proofing can cut outdoor particle entry by about 10–30% and heating energy by 10–15%.",
        },
  ];

  const alternatives: Suggestion[] = [
    motorised
      ? {
          title: "Swap two trips a week for metro, bus or a shared ride",
          detail: "Start with the school run or the weekly market trip and pool with a neighbour.",
          impact: "Each swapped 10 km car trip avoids about 1.7 kg CO2 and its tailpipe particles.",
        }
      : {
          title: "Keep your low-emission commute and share the idea",
          detail: "Invite colleagues or neighbours to walk, cycle or take transit together.",
          impact:
            "A car-free 10 km commute saves about 1.7 kg CO2 a trip, roughly 340 kg over 200 days.",
        },
    solidCooking
      ? {
          title: "Move to LPG or induction cooking",
          detail: "Look for subsidised clean-fuel schemes and keep the old stove only as a backup.",
          impact:
            "Clean fuels can lower kitchen PM2.5 by roughly 80–90% versus open biomass fires.",
        }
      : {
          title: "Cook with lids and a pressure cooker",
          detail: "Shorter cooking times mean less fuel burned and fewer fumes in the kitchen.",
          impact: "Pressure cooking can use roughly 30–50% less energy than an open pot.",
        },
    solidHeating
      ? {
          title: "Choose an electric heater or heat pump",
          detail: "Heat one room instead of the whole home and add insulation to keep the warmth.",
          impact: "Switching removes 100% of indoor combustion smoke from heating.",
        }
      : {
          title: "Layer up and lower the thermostat by 1°C",
          detail: "Wear warm clothes indoors and heat only the rooms you use.",
          impact: "Each 1°C lower saves about 6–10% of heating energy.",
        },
  ];

  return { snapshotSummary: summarize(snapshot, sensitive), routine, indoorHacks, alternatives };
}
