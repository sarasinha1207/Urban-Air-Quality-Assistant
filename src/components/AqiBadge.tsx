import type { AqiCategory } from "@/lib/aqi";

interface AqiBadgeProps {
  aqi: number;
  category: AqiCategory;
}

/** Shows the AQI as number, shape glyph and words, so colour is never the only signal. */
export function AqiBadge({ aqi, category }: AqiBadgeProps) {
  return (
    <p className={`aqi-badge aqi-${category.level}`}>
      <span aria-hidden="true" className="aqi-symbol">
        {category.symbol}
      </span>
      <span className="aqi-value">AQI {aqi}</span>
      <span>{category.label}</span>
    </p>
  );
}
