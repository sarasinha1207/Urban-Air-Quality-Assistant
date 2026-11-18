import AdvisorForm from "@/components/AdvisorForm";

// Rendered per request so Next can stamp the CSP nonce onto its scripts.
export const dynamic = "force-dynamic";

/** The single page: top bar and hero, the dashboard, and credits. */
export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="container">
        <div className="topbar">
          <p className="brand">
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
            Urban Air Quality
          </p>
          <p className="topbar-note">Free · No sign-up · Nothing stored</p>
        </div>
        <div className="hero">
          <p className="eyebrow">Winter smog toolkit</p>
          <h1>Urban Air Quality Assistant</h1>
          <p className="hero-text">
            Get a low-emission daily routine, indoor air hacks and sustainable swaps for winter
            smog, tailored to where you live and how your family lives.
          </p>
          <ul className="chips">
            <li>Live AQI data</li>
            <li>AI-personalised plan</li>
            <li>Impact of every choice</li>
            <li>Ask the assistant</li>
          </ul>
        </div>
      </header>
      <main id="main" className="container">
        <AdvisorForm />
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <p className="footer-brand">Urban Air Quality Assistant</p>
          <p>
            Air data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) · Plans by
            Google Gemini · Figures are estimates
          </p>
        </div>
      </footer>
    </>
  );
}
