/** Thrown when the geocoder finds no place for the user's query. */
export class LocationNotFoundError extends Error {
  constructor(query: string) {
    super(`No location found for "${query}"`);
    this.name = "LocationNotFoundError";
  }
}

/** Thrown when an upstream service (geocoder or air-quality API) fails, times out or misbehaves. */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/**
 * Reads the HTTP status an API client attached to an error (the Gemini SDK sets `status`).
 * @param error - Anything that was thrown.
 * @returns The status code, or `undefined` when the error carries none.
 */
export function httpStatusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Safe label for logs: error class and HTTP status only, never messages that could echo user input.
 * @param error - Anything that was thrown.
 */
export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const status = httpStatusOf(error);
  return status === undefined ? name : `${name} ${status}`;
}
