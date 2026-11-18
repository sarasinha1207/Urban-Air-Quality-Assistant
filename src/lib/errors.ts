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
