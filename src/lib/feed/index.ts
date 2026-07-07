// ─── Research Feed — Barrel Export ───

// arXiv
export {
  searchArxiv,
  searchPapersByAuthor,
  searchPapersByField,
  getLatestPapersForFields,
  getRecentPapersForResearcher,
  searchPapersByTopic,
  buildArxivRssUrl,
  buildArxivNewRssUrl,
} from './arxiv';
export type { ArxivPaper, ArxivSearchParams } from './arxiv';

// Feed Enricher
export {
  generatePersonFeed,
  generateFieldFeed,
  generatePersonalizedFeed,
  syncArxivToResearchUpdates,
  syncFieldResearchUpdates,
} from './enricher';
export type { EnrichedFeedItem, FeedQuery } from './enricher';
