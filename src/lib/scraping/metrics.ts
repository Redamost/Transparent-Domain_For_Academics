// ─── Scraping Metrics Collection ───
// Lightweight in-memory metrics for monitoring scraper health.
// Tracks: request counts, latency percentiles, per-university breakdown,
// error type distribution, and cache/dedup hit rates.
//
// Pattern: module-level singleton (same as TokenBucket, responseCache).

// ─── Types ───

export interface RequestCounts {
  total: number;
  succeeded: number;
  failed: number;
  cacheHits: number;
  cacheMisses: number;
  dedupSkips: number;
}

export interface LatencyStats {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  samples: number;
}

export interface UniversityMetrics {
  requests: number;
  succeeded: number;
  failed: number;
  profilesParsed: number;
}

export interface ScrapeMetricsSnapshot {
  requests: RequestCounts;
  latency: LatencyStats;
  byUniversity: Record<string, UniversityMetrics>;
  byErrorType: Record<string, number>;
  startedAt: string;
  durationMs: number;
}

// ─── Configuration ───

const LATENCY_BUFFER_MAX = 10_000; // max latency samples in ring buffer

// ─── Implementation ───

export class ScrapingMetrics {
  private startTime: number = Date.now();

  // Request counters
  private total = 0;
  private succeeded = 0;
  private failed = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private dedupSkips = 0;

  // Latency ring buffer (ms)
  private latencies: number[] = [];

  // Per-university stats
  private universityStats = new Map<string, UniversityMetrics>();

  // Error type distribution
  private errorTypes = new Map<string, number>();

  // ── Setters ──

  recordRequest(
    url: string,
    success: boolean,
    errorType?: string,
    latencyMs?: number,
    universityKey?: string,
  ): void {
    this.total++;
    if (success) {
      this.succeeded++;
    } else {
      this.failed++;
      if (errorType) {
        this.errorTypes.set(errorType, (this.errorTypes.get(errorType) || 0) + 1);
      }
    }

    if (latencyMs !== undefined) {
      this.latencies.push(latencyMs);
      if (this.latencies.length > LATENCY_BUFFER_MAX) {
        this.latencies.shift();
      }
    }

    if (universityKey) {
      let stats = this.universityStats.get(universityKey);
      if (!stats) {
        stats = { requests: 0, succeeded: 0, failed: 0, profilesParsed: 0 };
        this.universityStats.set(universityKey, stats);
      }
      stats.requests++;
      if (success) stats.succeeded++;
      else stats.failed++;
    }

    // Keep URL out of metrics to avoid memory pressure — only counts matter
    void url;
  }

  recordCacheHit(_url: string): void {
    this.cacheHits++;
  }

  recordCacheMiss(_url: string): void {
    this.cacheMisses++;
  }

  recordDedupHit(_url: string): void {
    this.dedupSkips++;
  }

  recordProfileResult(universityKey: string, parsed: boolean): void {
    let stats = this.universityStats.get(universityKey);
    if (!stats) {
      stats = { requests: 0, succeeded: 0, failed: 0, profilesParsed: 0 };
      this.universityStats.set(universityKey, stats);
    }
    if (parsed) stats.profilesParsed++;
  }

  // ── Getters ──

  /** Compute a full snapshot of current metrics. Non-destructive. */
  snapshot(): ScrapeMetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const samples = sorted.length;

    const percentile = (p: number): number => {
      if (samples === 0) return 0;
      const idx = Math.ceil((p / 100) * samples) - 1;
      return sorted[Math.max(0, Math.min(idx, samples - 1))];
    };

    const byUniversity: Record<string, UniversityMetrics> = {};
    for (const [key, stats] of this.universityStats) {
      byUniversity[key] = { ...stats };
    }

    const byErrorType: Record<string, number> = {};
    for (const [type, count] of this.errorTypes) {
      byErrorType[type] = count;
    }

    return {
      requests: {
        total: this.total,
        succeeded: this.succeeded,
        failed: this.failed,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        dedupSkips: this.dedupSkips,
      },
      latency: {
        p50Ms: percentile(50),
        p95Ms: percentile(95),
        p99Ms: percentile(99),
        maxMs: samples > 0 ? sorted[samples - 1] : 0,
        samples,
      },
      byUniversity,
      byErrorType,
      startedAt: new Date(this.startTime).toISOString(),
      durationMs: Date.now() - this.startTime,
    };
  }

  /** Reset all counters for a new scraping run. */
  reset(): void {
    this.startTime = Date.now();
    this.total = 0;
    this.succeeded = 0;
    this.failed = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.dedupSkips = 0;
    this.latencies = [];
    this.universityStats.clear();
    this.errorTypes.clear();
  }
}

// ─── Module Singleton ───

export const metrics = new ScrapingMetrics();
