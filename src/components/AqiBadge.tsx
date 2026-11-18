import type { AqiCategory } from "@/lib/aqi";

interface AqiBadgeProps {
  aqi: number;
  category: AqiCategory;
}

const SCALE_STEPS = [0, 1, 2, 3, 4, 5] as const;

/**
 * Shows the AQI as number, shape glyph and words, so colour is never the only signal. The coloured
 * scale underneath is decorative and hidden from assistive technology.
 */
export function AqiBadge({ aqi, category }: AqiBadgeProps) {
  return (
    <div className="aqi-block">
      <p className={`aqi-badge aqi-${category.level}`}>
        <span aria-hidden="true" className="aqi-symbol">
          {category.symbol}
        </span>
        <span className="aqi-value">AQI {aqi}</span>
        <span>{category.label}</span>
      </p>
      <div className="meter" aria-hidden="true">
        {SCALE_STEPS.map((step) => (
          <span
            key={step}
            className={`meter-seg meter-${step}${step <= category.level ? " on" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
