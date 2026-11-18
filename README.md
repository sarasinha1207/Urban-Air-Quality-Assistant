# Urban Air Quality Assistant

A GenAI web app that helps families and communities get through severe winter smog. Enter a city or
ZIP code (or use device location), describe your household and lifestyle, and get:

1. **Today's Air Snapshot** – live AQI and PM2.5 (Open-Meteo) explained for your household.
2. **Low-Emission Daily Routine**
3. **Indoor Air Hacks**
4. **Sustainable Alternatives**

Every suggestion carries a **"Your impact"** line that quantifies the effect of that choice.
The plan is written by Google Gemini. If Gemini or the air-quality API fails, the app degrades
gracefully (see [Failure handling](#failure-handling)). _Not medical advice._

## Quick start

```bash
npm install
cp .env.example .env.local   # then set GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable         | Required | Purpose                                                        |
| ---------------- | -------- | -------------------------------------------------------------- |
| `GEMINI_API_KEY` | yes      | Server-side Gemini key. Never exposed to the browser.          |
| `GEMINI_MODEL`   | no       | Defaults to the `gemini-flash-latest` alias; pin a model here. |

Scripts: `npm run lint`, `format:check`, `typecheck`, `test:coverage`, `e2e`, `audit:deps`,
`verify` (lint + format + types + coverage).

## Deploy to Vercel

Import the repo in Vercel (framework preset: Next.js), add `GEMINI_API_KEY` (and optionally
`GEMINI_MODEL`) under Project → Settings → Environment Variables, and deploy. No other config is
needed; the route declares `maxDuration = 40`.

## Architecture

```
src/
  app/
    page.tsx              Server component: shell, disclaimer, credits
    layout.tsx            Root layout
    api/advice/route.ts   POST handler: rate limit → validate → service → JSON
  components/
    AdvisorForm.tsx       Client form, states (idle/loading/error/success), focus management
    Results.tsx           Lazy-loaded results view (next/dynamic)
    AqiBadge.tsx, Fields.tsx
  lib/
    schemas.ts            Zod: request profile and Gemini output
    options.ts            Single source for every select/checkbox option
    aqi.ts                Open-Meteo geocoding + air quality (timeouts, edge cache, validation)
    gemini.ts, prompt.ts  Gemini call: system instruction separate from user data
    fallback.ts           Deterministic plan when Gemini is unavailable
    advice-service.ts     Orchestration, AI-response cache, graceful degradation
    rate-limit.ts, cache.ts, sanitize.ts, csp.ts, errors.ts
  proxy.ts                Per-request nonce CSP
```

Request flow: browser → `POST /api/advice` → input validated with Zod → geocode (if text) →
live AQI → Gemini (`responseMimeType: application/json` + JSON schema, output re-validated with
Zod) → response. The browser only ever talks to its own origin; all third-party calls are
server-side.

## Failure handling

| Failure                         | Behaviour                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Gemini error, timeout, bad JSON | Rule-based plan (`fallback.ts`) built from the same profile, with a visible notice |
| Air-quality API down            | Plan still produced (precautionary), snapshot shows "unavailable", notice shown    |
| Place not found / geocoder down | Clear 404 / 502 message, form stays editable                                       |
| Rate limited                    | 429 with `Retry-After`                                                             |
| Network failure in the browser  | Announced error message                                                            |

## Evidence for each criterion

### 1. Code quality

- Modular layers (route → service → clients), one responsibility per file; option lists defined once
  (`src/lib/options.ts`) and reused by form and validation; no duplicated schemas.
- TypeScript `strict` plus `noUncheckedIndexedAccess` (`tsconfig.json`); ESLint (`next/core-web-vitals`,
  `next/typescript`, `eslint-config-prettier`) run with `--max-warnings=0` (`eslint.config.mjs`);
  Prettier (`.prettierrc.json`).
- JSDoc on every exported function and component; `npm run build` emits no warnings.

### 2. Security

- Key is read from `process.env.GEMINI_API_KEY` only in `src/lib/gemini.ts` (server). Only
  `.env.example` is committed; `.env*` is git-ignored. Tests assert errors never leak the key
  (`tests/api/route.test.ts`).
- Zod validation of all input (`src/lib/schemas.ts`): closed enums, strict objects, a pattern-checked
  location string, 2 KB body cap, content-type check. Upstream API responses are validated too.
- Rate limit: 10 requests/minute/IP (`src/lib/rate-limit.ts`, applied in the route).
- Prompt-injection defence: instructions live in `systemInstruction` (`src/lib/prompt.ts`); user data
  goes in a delimited JSON block; free text is restricted to a safe character set and geocoder names
  are sanitised (`src/lib/sanitize.ts`); Gemini output must match a strict schema with no extra keys.
- Headers: `next.config.ts` (HSTS, nosniff, frame deny, referrer, permissions policy, COOP) and a
  nonce-based CSP with `strict-dynamic`, `connect-src 'self'`, `frame-ancestors 'none'`
  (`src/proxy.ts`, `src/lib/csp.ts`; verified in `e2e/happy-path.spec.ts`).
- No personal data is stored: no database, no cookies, no logging of inputs; device coordinates are
  rounded to ~1 km and kept in component state only.
- `npm audit --omit=dev` reports **0 vulnerabilities** (run in CI). A _dev-only_ advisory in
  `picomatch` (ReDoS, via vite/eslint tooling) currently has no patched release; it does not ship
  to production.

### 3. Efficiency

- Server component page; only the form is a client component; results view is lazy-loaded with
  `next/dynamic`; no web fonts, no client-side libraries beyond React (no Zod in the browser).
- AQI and geocoding use `fetch` revalidation (15 min); Gemini answers are cached 15 minutes per
  household/place/pollution band (`src/lib/advice-service.ts`, `src/lib/cache.ts`).
- Timeouts: 5 s for Open-Meteo, 20 s for Gemini (`AbortSignal.timeout`).
- Lighthouse (production build, mobile and desktop): **Performance 100, Accessibility 100, Best
  Practices 100, SEO 100** (LCP 0.8 s mobile, CLS 0).

### 4. Testing

- Vitest + React Testing Library: unit, component and API-route tests with Gemini and `fetch` mocked
  (`tests/`). Coverage gate ≥ 90% enforced in `vitest.config.ts`; current: 100% statements/lines/
  functions, ~98.7% branches (122 tests).
- Playwright happy path, error path, keyboard flow and header/CSP checks against the production
  build (`e2e/happy-path.spec.ts`).
- GitHub Actions (`.github/workflows/ci.yml`): lint, format, typecheck, coverage tests, audit, e2e.

### 5. Accessibility (WCAG 2.2 AA)

- Semantic landmarks and headings, skip link, every control labelled, native fieldsets/legends.
- Full keyboard use; visible `:focus-visible` outline; 44 px targets; focus moves to the results
  region after submit; results in an `aria-live` region, errors in `role="alert"`.
- AQI level is always number + words + shape glyph, never colour alone (`src/components/AqiBadge.tsx`).
- Contrast: every colour pair in `src/app/globals.css` is tested for ≥ 4.5:1 and borders for ≥ 3:1
  (`tests/contrast.test.ts`); `prefers-reduced-motion` stops the spinner; responsive single-column
  layout from 320 px.
- Automated axe-core tests on the empty, success and error states (`tests/components/a11y.test.tsx`)
  and Lighthouse Accessibility 100.

### 6. Problem statement alignment

- Inputs: city/ZIP or geolocation, children/elderly/health sensitivities, commute, home type,
  cooking and heating fuel (`src/components/AdvisorForm.tsx`).
- Live AQI/PM2.5 from keyless Open-Meteo is injected into the prompt.
- All four required sections, each suggestion with a quantified **"Your impact"** (the schema rejects
  impacts without a number); tailored to location and lifestyle by both Gemini and the fallback.
- "Not medical advice" disclaimer on the page and in the results; Open-Meteo credit in the footer.

## Known limits

- The rate limiter and AI cache are in-memory, so they are per warm serverless instance. Swap in
  Upstash/Vercel KV for global limits (noted in `src/lib/rate-limit.ts`).
- Impact figures are model estimates, labelled as such in the UI.
