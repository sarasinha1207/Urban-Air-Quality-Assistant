# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability
reporting (the repository's **Security** tab, then **Report a vulnerability**) and include the steps
to reproduce. A first response can be expected within a few days.

## How the app protects users and its keys

| Area               | Measure                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets            | `GEMINI_API_KEY` is read only in `src/lib/config.ts` on the server. `.env*` is git-ignored; only `.env.example` (no values) is committed.                       |
| Input              | Every request is validated with Zod (closed enums, strict objects, a pattern-checked location). Bodies are size-capped while being read, in bytes.              |
| Abuse              | Per-client rate limits (10 plans and 20 chats a minute), shared across instances when Redis credentials are set; cross-site browser requests are rejected.      |
| Prompt injection   | Instructions live in the system instruction; user data goes into a delimited JSON block; model output must match a strict schema and is rendered as plain text. |
| Browser protection | Nonce-based Content Security Policy, HSTS, `nosniff`, frame denial, a restrictive Permissions-Policy and cross-origin isolation headers.                        |
| Privacy            | No database, no cookies, no stored inputs. Rate-limit keys are hashed client addresses. Device coordinates are rounded to about 1 km.                           |
| Dependencies       | `npm audit` runs in CI on every push, CodeQL scans the code.                                                             |

## Supported versions

Only the latest commit on `main` is supported.
