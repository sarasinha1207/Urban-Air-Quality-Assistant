import type { z } from "zod";
import { UpstreamError } from "./errors";

const UPSTREAM_TIMEOUT_MS = 5_000;
const REVALIDATE_SECONDS = 900;

/** The only third-party hosts the server will contact (defence in depth against SSRF). */
export const ALLOWED_UPSTREAM_HOSTS: ReadonlySet<string> = new Set([
  "geocoding-api.open-meteo.com",
  "air-quality-api.open-meteo.com",
  "nominatim.openstreetmap.org",
]);

/**
 * Fetches JSON from an allow-listed third-party service over HTTPS with a hard timeout and edge
 * caching, then validates the payload against `schema`, so nothing unexpected from outside reaches
 * the rest of the app. Redirects are refused so a response cannot send the request elsewhere.
 * @param url - Request URL.
 * @param schema - Shape the response must have.
 * @param headers - Optional request headers.
 * @returns The validated payload.
 * @throws {UpstreamError} For a host that is not allowed, a network failure, a timeout, a non-2xx
 * status or an unexpected payload.
 */
export async function fetchJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  headers?: HeadersInit,
): Promise<T> {
  if (url.protocol !== "https:" || !ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
    throw new UpstreamError(`Request to ${url.hostname} is not allowed`);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    throw new UpstreamError(`Request to ${url.hostname} failed or timed out`);
  }
  if (!response.ok) throw new UpstreamError(`${url.hostname} responded with ${response.status}`);

  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new UpstreamError(`${url.hostname} returned an unexpected payload`);
  return parsed.data;
}
