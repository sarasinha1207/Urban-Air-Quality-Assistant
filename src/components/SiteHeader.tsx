const HERO_CHIPS = [
  "Live AQI data",
  "AI-personalised plan",
  "Impact of every choice",
  "Ask the assistant",
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h8"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function TopBar() {
  return (
    <div className="topbar">
      <p className="brand">
        <BrandMark />
        Urban Air Quality
      </p>
      <p className="topbar-note">Free · No sign-up · Nothing stored</p>
    </div>
  );
}

function Hero() {
  return (
    <div className="hero">
      <p className="eyebrow">Winter smog toolkit</p>
      <h1>Urban Air Quality Assistant</h1>
      <p className="hero-text">
        Get a low-emission daily routine, indoor air hacks and sustainable swaps for winter smog,
        tailored to where you live and how your family lives.
      </p>
      <ul className="chips">
        {HERO_CHIPS.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </ul>
    </div>
  );
}

/** The page header: brand bar and the hero introduction. */
export function SiteHeader() {
  return (
    <header className="container">
      <TopBar />
      <Hero />
    </header>
  );
}

/** The credits line: data source and the AI that powers the chat. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <p>
          <strong>Urban Air Quality Assistant</strong> · Live air data:{" "}
          <a href="https://open-meteo.com/">Open-Meteo</a> · Chat support: Google Gemini
        </p>
      </div>
    </footer>
  );
}
