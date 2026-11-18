"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdviceResponse } from "@/lib/advice-service";
import {
  COMMUTE_OPTIONS,
  CONDITION_OPTIONS,
  COOKING_FUEL_OPTIONS,
  HEATING_FUEL_OPTIONS,
  HOME_OPTIONS,
} from "@/lib/options";
import { CheckField, SelectField } from "./Fields";

// Both are only needed after load or after a submit, so keep them out of the first bundle.
const Results = dynamic(() => import("./Results"), {
  loading: () => <p role="status">Loading your plan…</p>,
});
const ChatWidget = dynamic(() => import("./ChatWidget"));

const GENERIC_ERROR = "Something went wrong. Please try again.";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AdviceResponse };

interface Coords {
  latitude: number;
  longitude: number;
}

/** Rounds to 2 decimals (about 1 km): precise enough for air data, too coarse to pinpoint a home. */
const roundCoord = (value: number) => Math.round(value * 100) / 100;

type Outcome = { ok: true; data: AdviceResponse } | { ok: false; message: string };

async function requestAdvice(profile: unknown): Promise<Outcome> {
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
    return { ok: false, message: "Network problem. Check your connection and try again." };
  }
}

/** The dashboard: household form on the left, live results on the right, chat in the corner. */
export default function AdvisorForm() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoMessage, setGeoMessage] = useState("");
  const resultsRef = useRef<HTMLElement>(null);

  // Move focus to the results so keyboard and screen-reader users land on the outcome.
  useEffect(() => {
    if (state.status === "success" || state.status === "error") resultsRef.current?.focus();
  }, [state.status]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoMessage("Your browser does not support location. Enter a city or ZIP code instead.");
      return;
    }
    setGeoMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords: position }) => {
        setCoords({
          latitude: roundCoord(position.latitude),
          longitude: roundCoord(position.longitude),
        });
        setGeoMessage("Using your device location. It is not stored.");
      },
      () => setGeoMessage("We could not get your location. Enter a city or ZIP code instead."),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === "loading") return;

    const form = new FormData(event.currentTarget);
    setState({ status: "loading" });
    const outcome = await requestAdvice({
      location: coords
        ? { kind: "coords", ...coords }
        : { kind: "query", query: String(form.get("location")) },
      hasChildren: form.has("hasChildren"),
      hasElderly: form.has("hasElderly"),
      conditions: form.getAll("conditions"),
      commute: form.get("commute"),
      home: form.get("home"),
      cookingFuel: form.get("cookingFuel"),
      heatingFuel: form.get("heatingFuel"),
    });
    setState(
      outcome.ok
        ? { status: "success", data: outcome.data }
        : { status: "error", message: outcome.message },
    );
  }

  const loading = state.status === "loading";
  const chatContext =
    state.status === "success" && state.data.snapshot
      ? { placeName: state.data.placeName, usAqi: state.data.snapshot.usAqi }
      : null;

  return (
    <>
      <div className="dashboard">
        <form onSubmit={onSubmit} className="card form">
          <h2>Your household</h2>
          <p className="muted form-intro">
            Answer a few questions and we will tailor the plan to you.
          </p>

          <fieldset>
            <legend>Where are you?</legend>
            <div className="field">
              <label htmlFor="location">City or ZIP code</label>
              <input
                id="location"
                name="location"
                type="text"
                autoComplete="off"
                placeholder="e.g. Delhi, 10001 or 110001, India"
                required={!coords}
                minLength={2}
                maxLength={80}
                aria-describedby="geo-status"
              />
            </div>
            <button type="button" className="secondary" onClick={useMyLocation}>
              Use my location
            </button>
            <p id="geo-status" className="muted geo-status" aria-live="polite">
              {geoMessage}
            </p>
          </fieldset>

          <fieldset>
            <legend>Who lives with you?</legend>
            <div className="checks">
              <CheckField name="hasChildren" label="Children under 12" />
              <CheckField name="hasElderly" label="Adults over 65" />
            </div>
          </fieldset>

          <fieldset>
            <legend>Health sensitivities (optional)</legend>
            <div className="checks">
              {CONDITION_OPTIONS.map((option) => (
                <CheckField
                  key={option.value}
                  name="conditions"
                  value={option.value}
                  label={option.label}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Your lifestyle</legend>
            <div className="grid">
              <SelectField
                name="commute"
                label="Main commute"
                options={COMMUTE_OPTIONS}
                defaultValue="public_transit"
              />
              <SelectField
                name="home"
                label="Home type"
                options={HOME_OPTIONS}
                defaultValue="apartment"
              />
              <SelectField
                name="cookingFuel"
                label="Cooking fuel"
                options={COOKING_FUEL_OPTIONS}
                defaultValue="lpg_or_gas"
              />
              <SelectField
                name="heatingFuel"
                label="Heating fuel"
                options={HEATING_FUEL_OPTIONS}
                defaultValue="electric"
              />
            </div>
          </fieldset>

          <button type="submit" className="primary" aria-disabled={loading}>
            {loading ? "Building your plan…" : "Get my clean-air plan"}
          </button>
        </form>

        <section
          ref={resultsRef}
          tabIndex={-1}
          aria-labelledby="results-heading"
          className="results"
        >
          <h2 id="results-heading">Your clean-air plan</h2>
          <div aria-live="polite" aria-busy={loading}>
            {state.status === "idle" && (
              <div className="empty">
                <svg aria-hidden="true" width="120" height="84" viewBox="0 0 120 84" fill="none">
                  <circle cx="34" cy="48" r="22" fill="#cfe2f7" />
                  <circle cx="62" cy="38" r="28" fill="#b6d3f2" />
                  <circle cx="90" cy="50" r="20" fill="#d9ebfa" />
                  <path
                    d="M18 70h84M30 78h56"
                    stroke="#0e6a78"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
                <p className="empty-title">Ready when you are</p>
                <p>
                  Fill in the form and your personalised plan will appear here, with the impact of
                  each choice.
                </p>
                <ol className="steps">
                  <li>Tell us about your household</li>
                  <li>We read live air quality for your area</li>
                  <li>Get a plan with the impact of every choice</li>
                </ol>
              </div>
            )}
            {loading && (
              <p role="status" className="loading">
                <span className="spinner" aria-hidden="true" />
                Reading live air data and building your plan…
              </p>
            )}
            {state.status === "error" && (
              <p role="alert" className="error">
                {state.message}
              </p>
            )}
            {state.status === "success" && <Results data={state.data} />}
          </div>
        </section>
      </div>

      <ChatWidget context={chatContext} />
    </>
  );
}
