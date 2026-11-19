import type { AirSnapshot } from "@/lib/air-quality";
import { AqiBadge } from "./AqiBadge";

/** The PM readings and the WHO comparison for one snapshot. */
function Readings({ snapshot }: { snapshot: AirSnapshot }) {
  return (
    <div>
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
      <p className="muted">Reading from {snapshot.observedAt.replace("T", " ")} (local time)</p>
    </div>
  );
}

interface SnapshotCardProps {
  placeName: string;
  /** `null` when the air-quality service was unavailable. */
  snapshot: AirSnapshot | null;
  /** One-sentence explanation of what the reading means for this household. */
  summary: string;
}

/** Today's Air Snapshot: the AQI badge, the readings and what they mean for the household. */
export function SnapshotCard({ placeName, snapshot, summary }: SnapshotCardProps) {
  return (
    <section aria-labelledby="snapshot-heading" className="card tone-snapshot">
      <h3 id="snapshot-heading">Today&rsquo;s Air Snapshot</h3>
      <p className="place">{placeName}</p>
      {snapshot ? (
        <div className="snapshot-grid">
          <AqiBadge aqi={snapshot.usAqi} category={snapshot.category} />
          <Readings snapshot={snapshot} />
        </div>
      ) : (
        <p>Live readings are unavailable right now.</p>
      )}
      <p className="summary">{summary}</p>
    </section>
  );
}
