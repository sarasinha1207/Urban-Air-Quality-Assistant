import type { AdviceResponse } from "@/lib/advice-service";

/** What the results area is showing. */
export type AdviceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AdviceResponse };

/** The reading chat answers can refer to, available once a plan has been shown. */
export function chatContextOf(state: AdviceState) {
  if (state.status !== "success" || !state.data.snapshot) return null;
  return { placeName: state.data.placeName, usAqi: state.data.snapshot.usAqi };
}

export interface Coords {
  latitude: number;
  longitude: number;
}

type Outcome = { ok: true; data: AdviceResponse } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "Network problem. Check your connection and try again.";

/**
 * Turns the submitted form into the request body the API expects. Device coordinates, when present,
 * replace the typed location.
 * @param form - The household form's data.
 * @param coords - Rounded device coordinates, or `null` to use the typed city or code.
 * @returns A plain object ready to send as JSON (validated again on the server).
 */
export function buildProfile(form: FormData, coords: Coords | null) {
  return {
    location: coords
      ? { kind: "coords", ...coords }
      : {
          kind: "query",
          query: String(form.get("location")),
          // An empty value means "Any country"; undefined is dropped from the JSON.
          country: String(form.get("country")) || undefined,
        },
    hasChildren: form.has("hasChildren"),
    hasElderly: form.has("hasElderly"),
    conditions: form.getAll("conditions"),
    commute: form.get("commute"),
    home: form.get("home"),
    cookingFuel: form.get("cookingFuel"),
    heatingFuel: form.get("heatingFuel"),
  };
}

/**
 * Sends the profile to the server and turns every failure into a message the user can read.
 * @param profile - Request body from `buildProfile`.
 */
export async function requestAdvice(profile: unknown): Promise<Outcome> {
  try {
    const response = await fetch("/api/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) return { ok: false, message: body?.error?.message ?? GENERIC_ERROR };
    return { ok: true, data: body as AdviceResponse };
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
}
