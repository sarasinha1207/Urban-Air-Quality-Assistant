# Urban Air Quality Assistant

> A Gemini-powered web app that helps families and communities get through severe winter smog.

## Description

Winter smog turns everyday choices into health decisions: whether children can play outside, which
mask to wear, whether to open a window, how to cook and heat the home. Generic advice does not help
because the right answer depends on **where you live, today's air and how your household lives**.

Urban Air Quality Assistant asks a few simple questions (location, who lives at home, commute, home
type, cooking and heating fuel), reads the **live air quality** for that place and uses **Google
Gemini** to write a personal plan with four parts:

1. **Today's Air Snapshot**: live AQI and PM2.5, explained for your household.
2. **Low-Emission Daily Routine**: what to do through the day.
3. **Indoor Air Quality Hacks**: practical ways to keep indoor air cleaner.
4. **Sustainable Alternatives**: lower-emission swaps for commuting, cooking and heating.

Every suggestion ends with a **"Your impact"** line that quantifies the direct effect of that choice
(for example "about 40% faster removal of indoor smoke"). A floating **chat assistant** answers
follow-up questions and can see the reading currently on screen.

![Dashboard with the live snapshot and the three plan sections](docs/dashboard-plan.png)

![Floating chat assistant answering a question about children and outdoor play](docs/chat-assistant.png)

## How it works

```
Browser form ──► POST /api/advice
                   │ 1. rate limit, size and content-type checks
                   │ 2. Zod validation of every field
                   │ 3. geocode the place        (Open-Meteo; OpenStreetMap for non-US postcodes)
                   │ 4. live AQI / PM2.5         (Open-Meteo Air Quality)
                   │ 5. Gemini writes the plan   (instructions and user data kept apart,
                   │                              JSON schema output, re-validated with Zod)
                   ▼ 6. dashboard renders snapshot + 3 sections, each with "Your impact"
Chat widget ───► POST /api/chat ──► Gemini (answers only about air quality)
```

- **Inputs:** a country (India by default) plus city, ZIP or PIN code, or the device location;
  children, adults over 65 and health sensitivities; commute mode; home type; cooking and heating
  fuel.
- **Grounding:** the live AQI and PM2.5 are injected into the prompt, so advice reflects today's air
  and not generic tips.
- **Structured output:** Gemini must return JSON that matches a strict schema. Anything else is
  rejected and the next model is tried.
- **All third-party calls happen on the server.** The browser only talks to its own origin, and the
  Gemini key never leaves the server.

## Key features

### Personalised advice

- Plan tailored to location, live AQI, household members, health sensitivities, commute, home
  type and fuels.
- Country dropdown (India by default) so a bare PIN or ZIP code such as `600001` resolves to the
  right city.
- Every suggestion carries a quantified **Your impact** line (the schema rejects impacts without a
  number).

### Always-on Gemini

- Gemini is the only AI used. The server tries five Gemini models in order and switches when one is
  exhausted (429), overloaded (503), retired (404), slow or returns an unusable reply.
- If a model has not answered after 4 seconds, the next one starts in parallel and the first valid
  reply wins. Overloaded models get one quick retry.
- If every model fails, the plan falls back to built-in guidance and the chat answers from built-in
  answers. Both are deterministic, clearly labelled and never leave the user with an error screen.

### Floating chat assistant

- Bottom-right launcher, suggested questions and a conversation that knows the current city and AQI.
- Stays on topic (air quality only) and refuses attempts to change its rules.
- Keyboard and screen-reader friendly: dialog and log roles, Escape closes, focus returns.

### Security and privacy

- Validated and sanitised input, prompt-injection defences, rate limiting, nonce-based Content
  Security Policy and security headers.
- Nothing is stored: no database, no cookies, no logging of inputs. Device coordinates are rounded
  to about 1 km.

### Accessible and fast

- WCAG 2.2 AA: landmarks, skip link, labelled controls, visible focus, colour never the only signal
  (AQI is shown as number, words and a shape), reduced-motion support, responsive from 320 px.
- Server-rendered page, lazy-loaded results and chat, cached air data and cached AI answers.

## Technology stack

| Area       | Choice                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19                                                |
| Language   | TypeScript 5.9 in strict mode with `noUncheckedIndexedAccess`                               |
| GenAI      | Google Gemini through the official `@google/genai` SDK, server-side only                    |
| Data       | Open-Meteo (geocoding and air quality, keyless), OpenStreetMap Nominatim (non-US postcodes) |
| Validation | Zod 4 for requests, Gemini output and upstream responses                                    |
| Styling    | Hand-written CSS with design tokens, no UI framework and no web fonts                       |
| Quality    | ESLint (Next + TypeScript rules), Prettier                                                  |
| Testing    | Vitest, React Testing Library, axe-core, Playwright, v8 coverage                            |
| CI and CD  | GitHub Actions (lint, format, types, tests, audit, e2e); deployment target is Vercel        |

## Folder structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx               Server component: header, hero, dashboard, footer
│   │   ├── layout.tsx             Root layout and metadata
│   │   ├── globals.css            Design tokens and all styles
│   │   └── api/
│   │       ├── advice/route.ts    POST: rate limit → validate → advice service → JSON
│   │       └── chat/route.ts      POST: chat assistant with its own schema and limit
│   ├── components/
│   │   ├── AdvisorForm.tsx        Household form, states, focus management
│   │   ├── Results.tsx            Snapshot and plan sections (lazy-loaded)
│   │   ├── ChatWidget.tsx         Floating chat (lazy-loaded)
│   │   └── AqiBadge.tsx, Fields.tsx
│   ├── lib/
│   │   ├── advice-service.ts      Orchestration: locate → air data → Gemini → fallback
│   │   ├── gemini.ts              Gemini calls, model failover, parallel start, retry
│   │   ├── prompt.ts              System instructions kept apart from user data
│   │   ├── schemas.ts, options.ts Zod schemas and the single source of form options
│   │   ├── aqi.ts                 Geocoding and air quality clients
│   │   ├── fallback.ts            Built-in plan when Gemini is unavailable
│   │   ├── chat-fallback.ts       Built-in chat answers when Gemini is unavailable
│   │   └── http.ts, rate-limit.ts, cache.ts, sanitize.ts, csp.ts, errors.ts
│   └── proxy.ts                   Per-request nonce Content Security Policy
├── tests/                         Unit, component, API-route and accessibility tests
├── e2e/happy-path.spec.ts         Playwright end-to-end tests
├── docs/                          README screenshots
├── .github/workflows/ci.yml       CI pipeline
├── .env.example                   Environment variable template (no secrets)
└── next.config.ts                 Security headers
```

## Getting started

```bash
npm install
cp .env.example .env.local   # then set GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable         | Required | Purpose                                                           |
| ---------------- | -------- | ----------------------------------------------------------------- |
| `GEMINI_API_KEY` | yes      | Server-side Gemini key. Never exposed to the browser.             |
| `GEMINI_MODELS`  | no       | Comma-separated Gemini models, tried in order (defaults built in) |

Scripts: `npm run lint`, `format:check`, `typecheck`, `test:coverage`, `e2e`, `audit:deps` and
`verify` (lint, format, types and coverage together).

**Deploy to Vercel:** import the repository (framework preset Next.js), add `GEMINI_API_KEY` under
Project → Settings → Environment Variables and deploy. No other configuration is needed. Use a key
from a Google AI project with billing enabled for production-level quotas; free-tier keys have low
limits and can be exhausted.

## Evaluation criteria

| Criterion                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code quality**          | Layered modules (route → service → clients) with one responsibility per file; form options defined once in `src/lib/options.ts` and reused by validation; strict TypeScript; ESLint with `--max-warnings=0` and Prettier; JSDoc on exported functions; no dead code.                                                                                                                                                                                  |
| **Security**              | Key read only in `src/lib/gemini.ts`; `.env*` git-ignored, only `.env.example` committed; Zod validation with closed enums, strict objects, a pattern-checked location and a country allow-list; body size and content-type checks; per-IP rate limits (10 plans and 20 chats a minute); instructions kept apart from user data; nonce CSP and security headers (`src/proxy.ts`, `next.config.ts`); `npm audit --omit=dev` reports 0 vulnerabilities. |
| **Efficiency**            | Server-rendered page; results view and chat lazy-loaded; no web fonts; air data cached for 15 minutes; Gemini answers cached for 15 minutes per household, place and pollution band; upstream timeouts; model cool-downs so failed models are not retried needlessly; plans take about 3 to 5 seconds.                                                                                                                                                |
| **Testing**               | 202 unit, component and API tests plus 6 Playwright tests; coverage gate of at least 90% enforced in `vitest.config.ts`; external services mocked; CI runs lint, format, types, tests, audit and e2e.                                                                                                                                                                                                                                                 |
| **Accessibility**         | Semantic landmarks and headings, skip link, labelled controls, full keyboard use, focus moved to results after submit, `aria-live` results, `role="alert"` errors, contrast of every colour pair tested (`tests/contrast.test.ts`), axe-core tests on every state, Lighthouse Accessibility 100.                                                                                                                                                      |
| **Problem statement fit** | Low-emission routines, indoor air hacks and sustainable alternatives, tailored to location and lifestyle, each with a quantified "Your impact" line; live air data grounds every plan; the chat assistant answers follow-up questions.                                                                                                                                                                                                                |

**Known gaps (honest self-assessment):**

- Mobile Lighthouse Performance varies between 90 and 96 on throttled runs because React hydration
  time depends on CPU load; every other Lighthouse score is 100.
- The rate limiter and AI cache are in memory, so they are per serverless instance.
- Impact figures are model estimates and are labelled as such in the UI.

## Testing results

Measured on the production build in November 2026.

| Check                             | Result                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Unit, component and API tests     | **202 passed** in 16 files, 0 failed                                                                                |
| End-to-end (Playwright, Chromium) | **6 passed**: keyboard happy path, error alert, CSP and headers, chat, API validation                               |
| Coverage                          | Statements **99.76%**, branches **97.15%**, functions **100%**, lines **100%**                                      |
| Lint, format, types               | ESLint with zero warnings, Prettier clean, `tsc --noEmit` clean                                                     |
| Dependency audit (production)     | `npm audit --omit=dev`: **0 vulnerabilities**                                                                       |
| Lighthouse, desktop               | Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**                                     |
| Lighthouse, mobile (throttled)    | Performance **90 to 96** across runs, Accessibility **100**, Best Practices **100**, SEO **100** (LCP 0.8 s, CLS 0) |
| Live Gemini check                 | 8 of 8 plans written by Gemini in 2.8 to 4.6 s; chat in about 2 s; injection attempt refused                        |

What the tests cover: input validation and injection attempts, rate limiting, error responses that
never leak internals, Gemini failover (429, 503, 404, timeouts, bad JSON, parallel start, retry and
cool-downs), the built-in fallbacks, the chat widget, colour contrast, axe-core accessibility on the
empty, success and error states, and the security headers.

Run them yourself: `npm run verify` for lint, format, types and coverage, and `npm run e2e` for the
browser tests.

## Future improvements

- Shared rate limiting and caching (Upstash or Vercel KV) so limits and cached answers hold across
  all serverless instances.
- Streaming plan output so the first suggestions appear while the rest is still being written.
- Multilingual interface and answers (Hindi and other regional languages).
- Air-quality forecasts and alerts, so families can plan the next days and not only today.
- Optional saved households (with consent) and a simple history of past readings.
- Neighbourhood-level data from local monitoring stations where available.
- Voice input and read-aloud for the chat assistant.
- A larger country list and a map-based location picker.
