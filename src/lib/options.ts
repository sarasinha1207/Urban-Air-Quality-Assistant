/**
 * Single source of truth for every selectable input. The form renders these options and the Zod
 * schemas derive their enums from them, so labels and validation can never drift apart.
 */

export const COMMUTE_OPTIONS = [
  { value: "walk", label: "Walk" },
  { value: "bicycle", label: "Bicycle" },
  { value: "public_transit", label: "Bus, metro or train" },
  { value: "car", label: "Car" },
  { value: "motorbike", label: "Motorbike or scooter" },
  { value: "work_from_home", label: "Work or study from home" },
] as const;

export const HOME_OPTIONS = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "Independent house" },
  { value: "shared_room", label: "Single room or shared dwelling" },
] as const;

export const COOKING_FUEL_OPTIONS = [
  { value: "electric", label: "Electric or induction" },
  { value: "lpg_or_gas", label: "LPG or piped gas" },
  { value: "biomass", label: "Wood, dung or crop waste" },
  { value: "coal", label: "Coal or charcoal" },
  { value: "kerosene", label: "Kerosene" },
] as const;

export const HEATING_FUEL_OPTIONS = [
  { value: "none", label: "No heating" },
  { value: "electric", label: "Electric heater or heat pump" },
  { value: "gas", label: "Gas heater" },
  { value: "biomass", label: "Wood or biomass" },
  { value: "coal", label: "Coal or charcoal" },
] as const;

export const CONDITION_OPTIONS = [
  { value: "respiratory", label: "Asthma or another lung condition" },
  { value: "heart", label: "Heart condition" },
  { value: "pregnancy", label: "Pregnancy" },
] as const;

/** ISO 3166-1 alpha-2 codes. India is first because it is the default in the form. */
export const COUNTRY_OPTIONS = [
  { value: "IN", label: "India" },
  { value: "PK", label: "Pakistan" },
  { value: "BD", label: "Bangladesh" },
  { value: "NP", label: "Nepal" },
  { value: "LK", label: "Sri Lanka" },
  { value: "CN", label: "China" },
  { value: "TH", label: "Thailand" },
  { value: "ID", label: "Indonesia" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "PL", label: "Poland" },
] as const;

/**
 * Extracts the `value` strings of an options list as a non-empty tuple, the shape `z.enum` needs.
 * @param options - A readonly list of `{ value, label }` options.
 * @returns The option values, typed as a literal union tuple.
 */
export function optionValues<T extends readonly { value: string }[]>(options: T) {
  return options.map((option) => option.value) as [T[number]["value"], ...T[number]["value"][]];
}
