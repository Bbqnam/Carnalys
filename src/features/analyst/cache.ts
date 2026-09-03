interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

/** Small per-instance cache for deterministic evidence. Freshness is part of every caller key. */
export class DeterministicEvidenceCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly maximumEntries = 300) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const current = this.entries.get(key) as CacheEntry<T> | undefined;
    if (current && current.expiresAt > Date.now()) return current.value;
    const value = await load();
    if (this.entries.size >= this.maximumEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}

export const analystEvidenceCache = new DeterministicEvidenceCache();

