// ─── Token Bucket Rate Limiter ───
// Generic token bucket algorithm for rate limiting HTTP requests.
// Reference: Crawlee (apify/crawlee) RequestQueue and ts-web-scraper TokenBucket.
//
// Unlike simple setTimeout delays, TokenBucket allows short bursts of
// requests while enforcing a long-term average rate. Tokens refill at a
// configurable rate — when tokens are exhausted, acquire() waits.

export interface TokenBucketConfig {
  /** Maximum tokens the bucket can hold (burst capacity) */
  capacity: number;
  /** Tokens added per refillIntervalMs */
  refillRate: number;
  /** How often tokens are added, in milliseconds (default: 1000) */
  refillIntervalMs: number;
}

export const DEFAULT_BUCKET_CONFIG: TokenBucketConfig = {
  capacity: 10,
  refillRate: 1,
  refillIntervalMs: 1000,
};

/**
 * A token bucket rate limiter.
 *
 * Usage:
 *   const bucket = new TokenBucket({ capacity: 5, refillRate: 1, refillIntervalMs: 2000 });
 *   await bucket.acquire(); // waits if no tokens available
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  readonly config: TokenBucketConfig;

  constructor(config: Partial<TokenBucketConfig> = {}) {
    this.config = { ...DEFAULT_BUCKET_CONFIG, ...config };
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
  }

  /** Refill tokens based on elapsed time since last refill. */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed < this.config.refillIntervalMs) return;

    const intervals = elapsed / this.config.refillIntervalMs;
    const tokensToAdd = Math.floor(intervals * this.config.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.config.capacity);
      // Carry over fractional intervals — only advance by full intervals
      this.lastRefill = now - (elapsed % this.config.refillIntervalMs);
    }
  }

  /**
   * Acquire tokens, waiting if necessary.
   * Returns after the requested number of tokens are available.
   */
  async acquire(count = 1): Promise<void> {
    this.refill();

    while (this.tokens < count) {
      // Wait for enough refill intervals to accumulate the needed tokens
      const neededTokens = count - this.tokens;
      const intervalsNeeded = Math.ceil(neededTokens / this.config.refillRate);
      const waitMs = intervalsNeeded * this.config.refillIntervalMs + 50; // +50ms padding
      await new Promise((r) => setTimeout(r, waitMs));
      this.refill();
    }

    this.tokens -= count;
  }

  /**
   * Non-blocking check: returns true if at least `count` tokens are available.
   * Does NOT consume tokens.
   */
  tryAcquire(count = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }

  /** Return the number of currently available tokens (for debugging). */
  availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /** Reset the bucket to full capacity. */
  reset(): void {
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
  }
}

// ─── Named Bucket Factory ───
// Lazy-create and cache buckets by key so different parts of the system
// can share the same rate limiter without passing instances around.

const bucketRegistry = new Map<string, TokenBucket>();

/**
 * Get or create a named TokenBucket.
 *
 *   const uniBucket = getBucket('tsinghua', { refillIntervalMs: 2500 });
 *   await uniBucket.acquire();
 */
export function getBucket(
  key: string,
  config?: Partial<TokenBucketConfig>,
): TokenBucket {
  let bucket = bucketRegistry.get(key);
  if (!bucket) {
    bucket = new TokenBucket(config);
    bucketRegistry.set(key, bucket);
  }
  return bucket;
}

/** Remove all cached buckets (for testing or reset). */
export function clearBuckets(): void {
  bucketRegistry.clear();
}

/** Get the number of registered bucket instances. */
export function bucketCount(): number {
  return bucketRegistry.size;
}
