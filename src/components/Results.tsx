import type { AdviceResponse } from "@/lib/advice-service";
import type { Suggestion } from "@/lib/schemas";
import { AqiBadge } from "./AqiBadge";

interface SuggestionSectionProps {
  id: string;
  title: string;
  items: Suggestion[];
}

function SuggestionSection({ id, title, items }: SuggestionSectionProps) {
  return (
    <section aria-labelledby={id} className="card">
      <h3 id={id}>{title}</h3>
      <ul className="suggestions">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
            <p className="impact">
              <strong>Your impact:</strong> {item.impact}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Renders the full plan: air snapshot, then the three suggestion sections, each with its impact.
 * Default export so it can be lazy-loaded with `next/dynamic`.
 */
export default function Results({ data }: { data: AdviceResponse }) {
  const { snapshot, advice, notices, placeName, source } = data;

  return (
    <div className="results-body">
      {notices.map((notice) => (
        <p key={notice} className="notice">
          {notice}
        </p>
      ))}

      <section aria-labelledby="snapshot-heading" className="card">
        <h3 id="snapshot-heading">Today&rsquo;s Air Snapshot</h3>
        <p className="place">{placeName}</p>
        {snapshot ? (
          <>
            <AqiBadge aqi={snapshot.usAqi} category={snapshot.category} />
            <dl className="readings">
              <div>
                <dt>PM2.5</dt>
                <dd>{snapshot.pm25} µg/m³</dd>
              </div>
              {snapshot.pm10 !== null && (
                <div>
                  <dt>PM10</dt>
                  <dd>{snapshot.pm10} µg/m³</dd>
                </div>
              )}
              <div>
                <dt>Versus WHO daily guideline</dt>
                <dd>{snapshot.whoMultiple}× the limit</dd>
              </div>
            </dl>
            <p className="muted">
              Reading from {snapshot.observedAt.replace("T", " ")} (local time)
            </p>
          </>
        ) : (
          <p>Live readings are unavailable right now.</p>
        )}
        <p>{advice.snapshotSummary}</p>
      </section>

      <SuggestionSection
        id="routine-heading"
        title="Low-Emission Daily Routine"
        items={advice.routine}
      />
      <SuggestionSection id="indoor-heading" title="Indoor Air Hacks" items={advice.indoorHacks} />
      <SuggestionSection
        id="alternatives-heading"
        title="Sustainable Alternatives"
        items={advice.alternatives}
      />

      <p className="muted">
        {source === "ai" ? "Plan written by Gemini AI." : "Plan from built-in smog guidance."}{" "}
        Impact figures are rough estimates. This is not medical advice.
      </p>
    </div>
  );
}
