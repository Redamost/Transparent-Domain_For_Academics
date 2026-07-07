import type { UserRole, ReportCategory, ReportStatus, ScoreCategory } from '@/generated/prisma/client';

// ─── User ───
export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  eduEmail: string | null;
  eduEmailVerified: string | null;
  institution: string | null;
  researchFields: string | null;
  bio: string | null;
  image: string | null;
  createdAt: string;
}

// ─── Person ───
export interface PersonSummary {
  id: string;
  nameZh: string;
  nameEn: string | null;
  title: string | null;
  institution: string | null;
  avatarUrl: string | null;
  score: number;
  hIndex: number | null;
  citationCount: number | null;
  metadata?: Record<string, unknown> | null;
  primaryFields: { slug: string; nameZh: string; nameEn: string }[];
}

export interface PersonDetail extends PersonSummary {
  alternativeNames: string | null;
  department: string | null;
  orcidId: string | null;
  googleScholarId: string | null;
  researchGateId: string | null;
  email: string | null;
  website: string | null;
  bioZh: string | null;
  bioEn: string | null;
  publicationCount: number | null;
  isVerified: boolean;
  scoreUpdatedAt: string;
  lastScrapedAt: string | null;
  fields: { slug: string; nameZh: string; nameEn: string; isPrimary: boolean }[];
  publications: PublicationSummary[];
  researchUpdates: ResearchUpdateItem[];
  competitionUpdates: CompetitionUpdateItem[];
  evaluationUpdates: EvaluationUpdateItem[];
}

// ─── Field ───
export interface FieldNode {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string | null;
  descriptionEn: string | null;
  level: number;
  children: FieldNode[];
  personCount?: number;
}

// ─── Publication ───
export interface PublicationSummary {
  id: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  url: string | null;
  citationCount: number | null;
}

// ─── Research Update ───
export interface ResearchUpdateItem {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  source: string | null;
  publishedAt: string | null;
}

// ─── Competition Update（竞赛动态）───
export interface CompetitionUpdateItem {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  source: string | null;
  level: string | null;
  award: string | null;
  publishedAt: string | null;
}

// ─── Evaluation Update（评比动态）───
export interface EvaluationUpdateItem {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  source: string | null;
  evalType: string | null;
  result: string | null;
  publishedAt: string | null;
}

// ─── Report ───
export interface ReportSummary {
  id: string;
  reporterId: string;
  reporterName: string;
  personId: string;
  personName: string;
  category: ReportCategory;
  title: string;
  status: ReportStatus;
  severity: number | null;
  createdAt: string;
}

export interface ReportDetail extends ReportSummary {
  description: string;
  adminNotes: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  evidences: { id: string; type: string; url: string; fileName: string; caption: string | null }[];
  reviews: { action: string; notes: string | null; reviewerName: string; createdAt: string }[];
}

// ─── Rating ───
export interface RatingHistoryEntry {
  id: string;
  category: ScoreCategory;
  oldValue: number;
  newValue: number;
  delta: number;
  source: string;
  notes: string | null;
  createdAt: string;
}

export interface ScoreBreakdownItem {
  category: ScoreCategory;
  value: number;
  weight: number;
}

// ─── API ───
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Dashboard ───
export interface CommunityStats {
  totalReports: number;
  approvedReports: number;
  rejectedReports: number;
  scoreImpact: number;
  streak: number;
  todayTasks: number;
}
