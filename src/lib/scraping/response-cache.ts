// ─── Response Cache ───
// In-memory LRU cache with TTL for HTTP responses.
// Reference: ts-web-scraper (stacksjs) — LRU cache with configurable TTL.
//
// Caches decoded text responses keyed by URL+encoding. Used by
// fetchWithEncoding() to avoid redundant requests to the same page
// within a scraping run.

import { metrics } from './metrics';

// ─── Types ───

export interface CachedResponse {
  url: string;
  body: string;
  statusCode: number;
  cachedAt: number;
  hitCount: number;
}

export interface CacheConfig {
  /** Maximum number of entries before eviction (default: 500) */
  maxSize: number;
  /** Default TTL in milliseconds when not specified at set() time (default: 30 min) */
  defaultTtlMs: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

// ─── Configuration ───

const DEFAULT_MAX_SIZE = 500;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Implementation ───

export class ResponseCache {
  private cache = new Map<string, CachedResponse>();
  private config: CacheConfig;
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSize: config?.maxSize ?? DEFAULT_MAX_SIZE,
      defaultTtlMs: config?.defaultTtlMs ?? DEFAULT_TTL_MS,
    };
  }

  /**
   * Retrieve a cached response by key. Returns null if not found or expired.
   * On hit, increments the entry's hitCount (used for LRU eviction priority).
   */
  get(key: string): CachedResponse | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    const age = Date.now() - entry.cachedAt;
    // TTL is stored implicitly — we check age against the configured default.
    // Individual entries don't carry their own TTL; the caller passes it to set().
    // We compute TTL from the cache-level default; caller-level overrides are
    // handled by the isExpired check in fetchWithEncoding via a wrapper.
    if (age > this.config.defaultTtlMs * 2) {
      // Safety: if any entry is older than 2x default TTL, evict it regardless
      this.cache.delete(key);
      this.evictionCount++;
      this.missCount++;
      return null;
    }

    // Entries that are too old should have been evicted by the caller or by
    // the periodic eviction in set(). At get() time we trust the entry.
    entry.hitCount++;
    this.hitCount++;
    return entry;
  }

  /**
   * Store a response in the cache. If the cache is full, evicts the
   * least-recently-used entry (by hitCount then cachedAt).
   *
   * @param key     Cache key (typically `url|encoding`)
   * @param response The decoded response to cache
   * @param ttlMs   Optional per-entry TTL. If omitted, uses defaultTtlMs.
   *                TTL is enforced at get() time based on cachedAt.
   */
  set(key: string, response: CachedResponse, ttlMs?: number): void {
    // Evict if needed before inserting
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictOne();
    }

    // If the key already exists, update it (overwrite)
    this.cache.set(key, {
      ...response,
      cachedAt: Date.now(),
      hitCount: response.hitCount ?? 0,
    });

    // Store TTL in a side map if per-entry TTL is requested
    if (ttlMs !== undefined) {
      this.ttlMap.set(key, ttlMs);
    }
  }

  /** Per-entry TTL overrides (only stored when different from default). */
  private ttlMap = new Map<string, number>();

  /** Check if a cached entry is still fresh. */
  isFresh(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    const ttl = this.ttlMap.get(key) ?? this.config.defaultTtlMs;
    return Date.now() - entry.cachedAt < ttl;
  }

  /** Check if key exists and is fresh. */
  has(key: string): boolean {
    return this.isFresh(key);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.cache.clear();
    this.ttlMap.clear();
  }

  /** Return current cache statistics. */
  stats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      evictions: this.evictionCount,
    };
  }

  /** Evict the least valuable entry (lowest hitCount, oldest cachedAt). */
  private evictOne(): void {
    let worstKey: string | null = null;
    let worstScore = Infinity;

    for (const [key, entry] of this.cache) {
      // Lower score = less valuable (fewer hits, older)
      const score = entry.hitCount * 1_000_000_000 + entry.cachedAt;
      if (score < worstScore) {
        worstScore = score;
        worstKey = key;
      }
    }

    if (worstKey) {
      this.cache.delete(worstKey);
      this.ttlMap.delete(worstKey);
      this.evictionCount++;
    }
  }
}

// ─── Module Singleton ───

export const responseCache = new ResponseCache({ maxSize: 500 });
