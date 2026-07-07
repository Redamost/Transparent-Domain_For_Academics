// ─── Scraping Pipeline Types ───

export type ScrapeSource = 'GOOGLE_SCHOLAR' | 'ORCID' | 'RESEARCHGATE' | 'SEMANTIC_SCHOLAR' | 'ARXIV' | 'CROSSREF' | 'CN_UNIVERSITY' | 'OPENALEX';

export interface ScrapedPerson {
  sourceId: string; // External ID on the source platform
  source: ScrapeSource;
  sourceUrl: string | null; // The URL from which this profile was scraped
  nameZh: string | null;
  nameEn: string | null;
  alternativeNames: string[];
  title: string | null;
  institution: string | null;
  department: string | null;
  email: string | null;
  website: string | null;
  avatarUrl: string | null;
  bio: string | null;
  hIndex: number | null;
  citationCount: number | null;
  publicationCount: number | null;
  fields: string[]; // Field slugs inferred from research area
  publications: ScrapedPublication[];
  researchUpdates: ScrapedResearchUpdate[];
  competitionUpdates: ScrapedCompetitionUpdate[];
  evaluationUpdates: ScrapedEvaluationUpdate[];
  rawMetadata: Record<string, unknown>;
}

export interface ScrapedResearchUpdate {
  title: string;
  description: string | null;
  url: string | null;
  source: string;
  publishedAt: string | null; // ISO date string
}

export interface ScrapedCompetitionUpdate {
  title: string;
  description: string | null;
  url: string | null;
  source: string;
  level: string | null;   // 竞赛级别
  award: string | null;    // 获奖情况
  publishedAt: string | null;
}

export interface ScrapedEvaluationUpdate {
  title: string;
  description: string | null;
  url: string | null;
  source: string;
  evalType: string | null;  // 评比类型
  result: string | null;    // 评比结果
  publishedAt: string | null;
}

export interface ScrapedPublication {
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  doi: string | null;
  url: string | null;
  citationCount: number | null;
  abstract: string | null;
  publishedAt: string | null;
}

export interface NormalizedPerson {
  id: string; // Will be assigned by deduplicator
  nameZh: string | null;
  nameEn: string | null;
  alternativeNames: string[];
  title: string | null;
  institution: string | null;
  department: string | null;
  orcidId: string | null;
  googleScholarId: string | null;
  researchGateId: string | null;
  semanticScholarId: string | null;
  email: string | null;
  website: string | null;
  avatarUrl: string | null;
  bio: string | null;
  hIndex: number | null;
  citationCount: number | null;
  publicationCount: number | null;
  fields: string[];
  publications: ScrapedPublication[];
  researchUpdates: ScrapedResearchUpdate[];
  competitionUpdates: ScrapedCompetitionUpdate[];
  evaluationUpdates: ScrapedEvaluationUpdate[];
  sources: string[]; // Which sources contributed data
  confidence: number; // 0-1 match confidence
  metadata: Record<string, unknown>;
}

export interface DedupResult {
  matched: boolean;
  existingPersonId: string | null;
  confidence: number;
  reason: string;
}

export interface CitationNode {
  personId: string;
  name: string;
  citations: number;
  hIndex: number | null;
  edges: CitationEdge[];
  pagerank: number;
  authority: number;
}

export interface CitationEdge {
  from: string; // Citing person ID
  to: string; // Cited person ID
  weight: number; // Citation count
}

export interface ScrapeTask {
  id: string;
  type: 'PERSON_SEARCH' | 'PERSON_UPDATE' | 'PUBLICATION_SYNC' | 'CITATION_ANALYSIS';
  priority: number; // 1-10, higher = more urgent
  params: Record<string, unknown>;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  retryCount: number;
}

export interface ScrapeStats {
  totalScraped: number;
  totalNormalized: number;
  totalDeduped: number;
  totalInserted: number;
  totalUpdated: number;
  errors: number;
  lastRunAt: Date | null;
  duration: number; // ms
}

export interface CitationAnalysisResult {
  topAuthorities: CitationNode[];
  communityClusters: Map<string, CitationNode[]>;
  totalNodes: number;
  totalEdges: number;
  convergenceIterations: number;
}
