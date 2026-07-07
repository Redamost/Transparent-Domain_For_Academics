// ─── Rate Limiter ───
// In-memory sliding window rate limiter for API routes.
// For production, replace with Redis-based implementation.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Optional: identifier for logging */
  name?: string;
}

// In-memory store (per-process, resets on restart)
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  for (const [key, entry] of store) {
    if (now - entry.windowStart > entry.count * 1000 + 60000) {
      // Entry hasn't been accessed in a while
      store.delete(key);
    }
  }
  lastCleanup = now;
}

/**
 * Check if a request should be rate limited.
 * Returns { allowed: boolean, remaining: number, reset: number }
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; reset: number; retryAfter: number } {
  cleanupExpiredEntries();

  const now = Date.now();
  const key = `${config.name || 'default'}:${identifier}`;
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      reset: now + config.windowMs,
      retryAfter: 0,
    };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + config.windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      reset: entry.windowStart + config.windowMs,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    reset: entry.windowStart + config.windowMs,
    retryAfter: 0,
  };
}

/**
 * Extract a unique identifier from a request.
 * Uses IP + optional user ID for authenticated requests.
 */
export function getRateLimitIdentifier(
  req: Request,
  userId?: string
): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  return userId ? `${ip}:${userId}` : ip;
}

// ─── Preset Configs ───

export const RATE_LIMITS = {
  /** General API: 100 req/min */
  API: { maxRequests: 100, windowMs: 60_000, name: 'api' },
  /** Auth endpoints: 60 req/min — session polling needs higher limit */
  AUTH: { maxRequests: 60, windowMs: 60_000, name: 'auth' },
  /** Report submission: 5 req/min */
  REPORT: { maxRequests: 5, windowMs: 60_000, name: 'report' },
  /** Search: 30 req/min */
  SEARCH: { maxRequests: 30, windowMs: 60_000, name: 'search' },
  /** Strict: 3 req/min for sensitive operations */
  STRICT: { maxRequests: 3, windowMs: 60_000, name: 'strict' },
  /** Upload: 10 req/min */
  UPLOAD: { maxRequests: 10, windowMs: 60_000, name: 'upload' },
} as const;
