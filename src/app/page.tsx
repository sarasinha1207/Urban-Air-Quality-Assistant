import AdvisorForm from "@/components/AdvisorForm";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

// Rendered per request so Next can stamp the CSP nonce onto its scripts.
export const dynamic = "force-dynamic";

/** The single page: header and hero, the dashboard, and credits. */
export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="container">
        <AdvisorForm />
      </main>
      <SiteFooter />
    </>
  );
}
