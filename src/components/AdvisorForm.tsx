"use client";

import dynamic from "next/dynamic";
import type { FormEvent } from "react";
import { chatContextOf } from "./advice-request";
import { HouseholdFieldsets } from "./HouseholdFieldsets";
import { LocationFieldset } from "./LocationFieldset";
import { PlanPanel } from "./PlanPanel";
import { useAdvice } from "./use-advice";
import { useDeviceLocation } from "./use-device-location";

// Only needed after load, so keep it out of the first bundle.
const ChatWidget = dynamic(() => import("./ChatWidget"));

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <button type="submit" className="primary" aria-disabled={loading}>
      {loading ? "Building your plan…" : "Get my clean-air plan"}
    </button>
  );
}

/** The dashboard: household form on the left, live results on the right, chat in the corner. */
export default function AdvisorForm() {
  const { state, submit } = useAdvice();
  const location = useDeviceLocation();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(new FormData(event.currentTarget), location.coords);
  }

  const loading = state.status === "loading";

  return (
    <>
      <div className="dashboard">
        <form onSubmit={onSubmit} className="card form">
          <h2>Your household</h2>
          <p className="muted form-intro">
            Answer a few questions and we will tailor the plan to you.
          </p>

          <LocationFieldset
            locationRequired={!location.coords}
            statusMessage={location.message}
            onUseMyLocation={location.request}
          />
          <HouseholdFieldsets />

          <SubmitButton loading={loading} />
        </form>

        <PlanPanel state={state} />
      </div>

      <ChatWidget context={chatContextOf(state)} />
    </>
  );
}
