import { LIMITS } from "@/lib/limits";
import { COUNTRY_OPTIONS } from "@/lib/options";
import { SelectField } from "./Fields";

const COUNTRY_CHOICES = [...COUNTRY_OPTIONS, { value: "", label: "Any country" }];

function LocationInput({ required }: { required: boolean }) {
  return (
    <div className="field">
      <label htmlFor="location">City or ZIP code</label>
      <input
        id="location"
        name="location"
        type="text"
        autoComplete="off"
        placeholder="e.g. Delhi or 600001"
        required={required}
        minLength={LIMITS.location.min}
        maxLength={LIMITS.location.max}
        aria-describedby="geo-status"
      />
    </div>
  );
}

interface LocationFieldsetProps {
  /** The typed location is optional once device coordinates are in use. */
  locationRequired: boolean;
  /** Status text for the device-location button, announced politely. */
  statusMessage: string;
  onUseMyLocation: () => void;
}

/** "Where are you?": country, city or code, and the device-location shortcut. */
export function LocationFieldset({
  locationRequired,
  statusMessage,
  onUseMyLocation,
}: LocationFieldsetProps) {
  return (
    <fieldset>
      <legend>Where are you?</legend>
      <SelectField name="country" label="Country" options={COUNTRY_CHOICES} defaultValue="IN" />
      <LocationInput required={locationRequired} />
      <button type="button" className="secondary" onClick={onUseMyLocation}>
        Use my location
      </button>
      <p id="geo-status" className="muted geo-status" aria-live="polite">
        {statusMessage}
      </p>
    </fieldset>
  );
}
