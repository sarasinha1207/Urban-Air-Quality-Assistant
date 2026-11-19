import type { AdviceResponse } from "@/lib/advice-service";
import type { Suggestion } from "@/lib/schemas";
import { SnapshotCard } from "./SnapshotCard";

interface SuggestionSectionProps {
  id: string;
  title: string;
  items: Suggestion[];
  /** Colour theme for the section, defined in src/styles/sections.css. */
  tone: "routine" | "indoor" | "alt";
}

function SuggestionSection({ id, title, items, tone }: SuggestionSectionProps) {
  return (
    <section aria-labelledby={id} className={`card tone-${tone}`}>
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

function Notices({ notices }: { notices: string[] }) {
  return notices.map((notice) => (
    <p key={notice} className="notice">
      {notice}
    </p>
  ));
}

function SuggestionSections({ advice }: { advice: AdviceResponse["advice"] }) {
  return (
    <div className="sections">
      <SuggestionSection
        id="routine-heading"
        title="Low-Emission Daily Routine"
        items={advice.routine}
        tone="routine"
      />
      <SuggestionSection
        id="indoor-heading"
        title="Indoor Air Hacks"
        items={advice.indoorHacks}
        tone="indoor"
      />
      <SuggestionSection
        id="alternatives-heading"
        title="Sustainable Alternatives"
        items={advice.alternatives}
        tone="alt"
      />
    </div>
  );
}

/**
 * Renders the full plan: air snapshot, then the three suggestion sections, each with its impact.
 * Default export so it can be lazy-loaded with `next/dynamic`.
 */
export default function Results({ data }: { data: AdviceResponse }) {
  const { snapshot, advice, notices, placeName, source } = data;
  const origin =
    source === "ai" ? "Plan written by Gemini AI." : "Plan from built-in smog guidance.";

  return (
    <div className="results-body">
      <Notices notices={notices} />
      <SnapshotCard placeName={placeName} snapshot={snapshot} summary={advice.snapshotSummary} />
      <SuggestionSections advice={advice} />
      <p className="muted">{origin} Impact figures are rough estimates.</p>
    </div>
  );
}
