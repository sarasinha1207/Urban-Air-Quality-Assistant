"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import type { AdviceState } from "./advice-request";

// Only needed after a submit, so it stays out of the first bundle.
const Results = dynamic(() => import("./Results"), {
  loading: () => <p role="status">Loading your plan…</p>,
});

/** Placeholder shown before the first request. */
function EmptyState() {
  return (
    <div className="empty">
      <svg aria-hidden="true" width="120" height="84" viewBox="0 0 120 84" fill="none">
        <circle cx="34" cy="48" r="22" fill="#cfe2f7" />
        <circle cx="62" cy="38" r="28" fill="#b6d3f2" />
        <circle cx="90" cy="50" r="20" fill="#d9ebfa" />
        <path d="M18 70h84M30 78h56" stroke="#0e6a78" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <p className="empty-title">Ready when you are</p>
      <p>
        Fill in the form and your personalised plan will appear here, with the impact of each
        choice.
      </p>
      <ol className="steps">
        <li>Tell us about your household</li>
        <li>We read live air quality for your area</li>
        <li>Get a plan with the impact of every choice</li>
      </ol>
    </div>
  );
}

/**
 * The results area. After a request finishes, focus moves here so keyboard and screen-reader users
 * land on the outcome.
 * @param props.state - What to show: placeholder, progress, an error or the plan.
 */
export function PlanPanel({ state }: { state: AdviceState }) {
  const ref = useRef<HTMLElement>(null);
  const loading = state.status === "loading";

  useEffect(() => {
    if (state.status === "success" || state.status === "error") ref.current?.focus();
  }, [state.status]);

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="results-heading" className="results">
      <h2 id="results-heading">Your clean-air plan</h2>
      <div aria-live="polite" aria-busy={loading}>
        {state.status === "idle" && <EmptyState />}
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
  );
}
