import { z } from 'zod';

// ─── Auth ───
export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least 1 letter and 1 number'),
});

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const eduEmailSchema = z.object({
  eduEmail: z.string().email().regex(/\.edu(\.cn)?$/i, 'Must be an .edu or .edu.cn email address'),
  institution: z.string().optional(),
});

export const verifyEduTokenSchema = z.object({
  token: z.string().min(1),
});

// ─── Person ───
export const createPersonSchema = z.object({
  nameZh: z.string().min(1).max(100),
  nameEn: z.string().max(200).optional(),
  alternativeNames: z.string().optional(),
  title: z.string().max(200).optional(),
  institution: z.string().max(300).optional(),
  department: z.string().max(300).optional(),
  orcidId: z.string().optional(),
  googleScholarId: z.string().optional(),
  researchGateId: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  bioZh: z.string().optional(),
  bioEn: z.string().optional(),
  fieldIds: z.array(z.string()).min(1),
  primaryFieldId: z.string().optional(),
});

export const updatePersonSchema = createPersonSchema.partial();

export const personQuerySchema = z.object({
  field: z.string().optional(),
  name: z.string().optional(),
  institution: z.string().optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['score_desc', 'score_asc', 'name_asc', 'name_desc', 'hIndex_desc']).default('score_desc'),
});

// ─── Report ───
export const createReportSchema = z.object({
  personId: z.string().min(1),
  category: z.enum(['ACADEMIC_MISCONDUCT', 'RIGOROUS_RESEARCH', 'CONFLICT_OF_INTEREST', 'CITATION_MANIPULATION', 'OTHER']),
  title: z.string().min(5).max(200),
  description: z.string().min(50).max(10000),
  severity: z.number().int().min(1).max(5).optional(),
  evidenceIds: z.array(z.string()).min(1).max(5),
});

export const reportQuerySchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPEALED']).optional(),
  category: z.enum(['ACADEMIC_MISCONDUCT', 'RIGOROUS_RESEARCH', 'CONFLICT_OF_INTEREST', 'CITATION_MANIPULATION', 'OTHER']).optional(),
  personId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reviewReportSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'NEED_MORE_INFO']),
  notes: z.string().max(2000).optional(),
  scoreDelta: z.record(z.string(), z.number().min(-50).max(50)).optional(),
});

// ─── Field ───
export const createFieldSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100),
  nameZh: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(200),
  descriptionZh: z.string().optional(),
  descriptionEn: z.string().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

// ─── Search ───
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  field: z.string().optional(),
  institution: z.string().optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  type: z.enum(['person', 'publication']).default('person'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── User Management ───
export const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'COMMUNITY', 'USER']).optional(),
  institution: z.string().optional(),
  researchFields: z.string().optional(),
  bio: z.string().optional(),
});
