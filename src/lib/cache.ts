/** A tiny in-memory cache with per-entry expiry and a hard size cap (oldest entry evicted first). */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  /**
   * @param key - Cache key.
   * @param now - Current time in ms (injectable for tests).
   * @returns The cached value, or `undefined` when missing or expired.
   */
  get(key: string, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Stores a value, evicting the oldest entry when the cache is full.
   * @param key - Cache key.
   * @param value - Value to store.
   * @param now - Current time in ms (injectable for tests).
   */
  set(key: string, value: V, now = Date.now()): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }
}
