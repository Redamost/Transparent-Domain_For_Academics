// ─── Scraping Pipeline — Barrel Export ───
// Single-source architecture: Chinese university website scraping only.
// University faculty list pages are authoritative sources that naturally
// limit results to verified Chinese scholars — no garbage from keyword APIs.
//
// Data extracted per scholar:
//   - Basic info: name, title, department, email, bio
//   - Publications: papers listed on profile pages
//   - Research topics: research interests and projects
//   - Competition updates: student/team competition awards
//   - Evaluation updates: talent titles, honor awards, teaching evaluations

// Types
export type {
  ScrapedPerson,
  ScrapedPublication,
  ScrapedResearchUpdate,
  ScrapedCompetitionUpdate,
  ScrapedEvaluationUpdate,
  NormalizedPerson,
  DedupResult,
  CitationNode,
  CitationEdge,
  ScrapeTask,
  ScrapeStats,
  CitationAnalysisResult,
  ScrapeSource,
} from './types';

// Chinese University Website Scraper (primary and only data source)
export {
  scrapeUniversity,
  scrapeUniversities,
  fetchAndParseProfile,
  fetchWithEncoding,
  getSupportedUniversities,
  getUniversityConfig,
  UNIVERSITY_CONFIGS,
} from './cn-university';
export type { UniversityScrapeStats } from './cn-university';

// Name Validator (quality gate)
export {
  isValidPersonName,
  isValidScrapedPerson,
  isDefinitelyGarbage,
} from './name-validator';
export type { NameValidationResult } from './name-validator';

// Normalizer
export {
  canonicalizeName,
  generateNameVariants,
  normalizeInstitution,
  mapToFieldSlugs,
  dedupPersonPublications,
  mergePersonSources,
  calculatePersonSimilarity,
} from './normalizer';

// Deduplicator
export {
  deduplicatePerson,
  batchDeduplicate,
} from './deduplicator';

// Citation Network
export {
  buildCitationGraph,
  runPageRank,
  computeAuthorityScores,
  detectCommunities,
  analyzeFieldPowerStructure,
  persistAuthorityScores,
} from './citation-network';

// Scheduler
export {
  queueTask,
  runScheduledScrape,
  refreshPersonData,
} from './scheduler';

// Semantic Scholar API Client
export {
  searchAuthor,
  getAuthorDetail,
  matchAuthor,
  enrichPersonFromS2,
} from './semantic-scholar';
export type {
  S2AuthorSearchResult,
  S2AuthorDetail,
  S2Paper,
} from './semantic-scholar';

// Semantic Scholar Enricher
export {
  selectCandidates as selectSemanticScholarCandidates,
  batchEnrichFromS2,
  getBacklog as getSemanticScholarBacklog,
} from './semantic-scholar-enricher';

// Cleanup
export {
  countSeedData,
  cleanupSeedData,
  purgeDeactivatedPersons,
} from './cleanup';
export type { CleanupStats } from './cleanup';

// Rate Limiter (Token Bucket)
export { TokenBucket, getBucket, clearBuckets } from './rate-limiter';
export type { TokenBucketConfig } from './rate-limiter';

// Response Cache
export { ResponseCache, responseCache } from './response-cache';
export type { CachedResponse, CacheConfig, CacheStats } from './response-cache';

// Scraping Metrics
export { ScrapingMetrics, metrics } from './metrics';
export type { ScrapeMetricsSnapshot, RequestCounts, LatencyStats, UniversityMetrics } from './metrics';

// Request Deduplication
export { clearRequestDedup } from './cn-university';

// Semantic Scholar — DOI fallback
export { findAuthorByDoi } from './semantic-scholar';
