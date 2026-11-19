import {
  COMMUTE_OPTIONS,
  CONDITION_OPTIONS,
  COOKING_FUEL_OPTIONS,
  HEATING_FUEL_OPTIONS,
  HOME_OPTIONS,
} from "@/lib/options";
import { CheckField, SelectField } from "./Fields";

/** The lifestyle questions, each with the answer most households give as the default. */
const LIFESTYLE_FIELDS = [
  {
    name: "commute",
    label: "Main commute",
    options: COMMUTE_OPTIONS,
    defaultValue: "public_transit",
  },
  { name: "home", label: "Home type", options: HOME_OPTIONS, defaultValue: "apartment" },
  {
    name: "cookingFuel",
    label: "Cooking fuel",
    options: COOKING_FUEL_OPTIONS,
    defaultValue: "lpg_or_gas",
  },
  {
    name: "heatingFuel",
    label: "Heating fuel",
    options: HEATING_FUEL_OPTIONS,
    defaultValue: "electric",
  },
] as const;

function WhoLivesFieldset() {
  return (
    <fieldset>
      <legend>Who lives with you?</legend>
      <div className="checks">
        <CheckField name="hasChildren" label="Children under 12" />
        <CheckField name="hasElderly" label="Adults over 65" />
      </div>
    </fieldset>
  );
}

function HealthFieldset() {
  return (
    <fieldset>
      <legend>Health sensitivities (optional)</legend>
      <div className="checks">
        {CONDITION_OPTIONS.map(({ value, label }) => (
          <CheckField key={value} name="conditions" value={value} label={label} />
        ))}
      </div>
    </fieldset>
  );
}

function LifestyleFieldset() {
  return (
    <fieldset>
      <legend>Your lifestyle</legend>
      <div className="grid">
        {LIFESTYLE_FIELDS.map((field) => (
          <SelectField key={field.name} {...field} />
        ))}
      </div>
    </fieldset>
  );
}

/** Who lives at home, their health sensitivities and the household's lifestyle choices. */
export function HouseholdFieldsets() {
  return (
    <>
      <WhoLivesFieldset />
      <HealthFieldset />
      <LifestyleFieldset />
    </>
  );
}
