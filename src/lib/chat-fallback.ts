import { categorize } from "./aqi";
import type { ChatRequest } from "./schemas";

/**
 * Fixed answers for the most common questions, used only when every Gemini model is unavailable.
 * This is deterministic guidance, not AI; the first matching topic wins.
 */
const TOPICS: readonly { match: RegExp; reply: string }[] = [
  {
    match: /mask|n95|ffp2|respirator/i,
    reply:
      "Outdoors on smoggy days, wear a well-fitted N95 or FFP2 respirator; cloth and surgical masks block very little PM2.5. Check the seal: there should be no gaps at the nose or cheeks.",
  },
  {
    match: /child|kid|baby|toddler|infant|school|play/i,
    reply:
      "Children breathe more air for their size, so when the AQI is above 150 keep them indoors with windows shut and move play and exercise inside. Use a mask only for children old enough to wear a snug one comfortably.",
  },
  {
    match: /elderly|asthma|copd|heart|pregnan|symptom|cough|breath|doctor|health|sick/i,
    reply:
      "Sensitive people should stay indoors when the AQI is above 100, keep prescribed inhalers or medicines within reach, and avoid exertion. See a doctor promptly for breathlessness, chest pain, wheezing or a cough that is getting worse.",
  },
  {
    match: /purifier|hepa|filter/i,
    reply:
      "Choose a HEPA purifier rated for your room size, run it on high with doors and windows closed, and replace the filter as the maker advises (sooner during long smog spells).",
  },
  {
    match: /window|ventilat|fresh air/i,
    reply:
      "Keep windows shut during the morning and evening pollution peaks. If you must ventilate, do it briefly in the afternoon, when the air is usually cleanest.",
  },
  {
    match: /cook|stove|kitchen|gas|lpg|smoke|fume/i,
    reply:
      "Run the extractor hood or fan while cooking and for ten minutes afterwards, keep lids on pots, and use induction or electric cooking where you can: it adds far less indoor PM2.5 than gas or biomass.",
  },
  {
    match: /heat|coal|wood|fire|incense|candle|chimney/i,
    reply:
      "Avoid burning wood, coal, incense or candles indoors on smoggy days. Electric heating, extra layers and draught-proofing keep you warm without adding particles to the air.",
  },
  {
    match: /exercis|jog|run|walk|cycl|bike|outdoor|outside|sport|workout/i,
    reply:
      "Move workouts indoors when the AQI is above 100 and skip outdoor exercise above 150. If you must go out, pick midday and quiet, low-traffic routes.",
  },
  {
    match: /commut|car|bus|metro|train|transport|travel|\bev\b|electric vehicle|carpool/i,
    reply:
      "Metro, bus, walking or carpooling cut your emissions and exposure compared with driving alone. In a car, keep the windows shut and set the ventilation to recirculate.",
  },
  {
    match: /plant/i,
    reply:
      "Houseplants do very little for room air at normal sizes. Source control (cooking ventilation, no indoor burning) and a HEPA purifier work much better.",
  },
  {
    match: /pm\s?2\.?5|pm\s?10|aqi|index|particulate|who\b/i,
    reply:
      "The AQI is a 0 to 500 scale (higher is worse). PM2.5 means particles under 2.5 micrometres that reach deep into the lungs; the WHO 24-hour guideline is 15 µg/m³.",
  },
];

const GENERAL =
  "I can help with air quality: masks, purifiers, cooking and heating, commuting and protecting children, elders and anyone with asthma. As a rule, limit time outdoors when the AQI is high, keep windows shut at peak hours and avoid burning anything indoors.";

/**
 * Builds a reply without Gemini, so the chat still answers when every model is unavailable.
 * @param request - Validated chat request; the last message is the user's question.
 * @returns Plain-text guidance, with today's reading when the context has one.
 */
export function buildFallbackReply({ messages, context }: ChatRequest): string {
  const question = messages.at(-1)?.content ?? "";
  const answer = TOPICS.find(({ match }) => match.test(question))?.reply ?? GENERAL;
  const reading = context
    ? `Right now in ${context.placeName} the US AQI is ${context.usAqi} (${categorize(context.usAqi).label}). `
    : "";
  return reading + answer;
}
