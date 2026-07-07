/**
 * API Validation Unit Tests
 *
 * Tests for Zod validation schemas used in API routes.
 * Validates all input shapes: registration, sign-in, reports, persons, etc.
 *
 * Run with: npx vitest run tests/api-validation.test.ts
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Re-create validation schemas for isolated testing ───
// In a real setup you'd import from '@/lib/api/validation'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
  institution: z.string().max(200).optional(),
  researchFields: z.string().max(500).optional(),
});

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const eduEmailSchema = z.object({
  eduEmail: z
    .string()
    .email('Invalid email address')
    .regex(
      /\.edu(\.\w{2,3})?$/i,
      'Must be a .edu or .edu.xx email address'
    ),
});

const createPersonSchema = z.object({
  nameZh: z.string().min(1, 'Chinese name is required').max(100),
  nameEn: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  institution: z.string().max(300).optional(),
  department: z.string().max(200).optional(),
  orcidId: z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/).optional(),
  googleScholarId: z.string().max(100).optional(),
  researchGateId: z.string().max(100).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  bioZh: z.string().max(2000).optional(),
  bioEn: z.string().max(2000).optional(),
  fieldSlugs: z.array(z.string()).min(1, 'At least one field is required'),
});

const createReportSchema = z.object({
  personId: z.string().min(1),
  category: z.enum([
    'ACADEMIC_MISCONDUCT',
    'RIGOROUS_RESEARCH',
    'CONFLICT_OF_INTEREST',
    'CITATION_MANIPULATION',
    'OTHER',
  ]),
  title: z.string().min(5, 'Title must be at least 5 characters').max(200),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000),
  severity: z.number().int().min(1).max(5).optional(),
});

const reviewReportSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'NEED_MORE_INFO']),
  notes: z.string().max(1000).optional(),
  categoryDeltas: z
    .record(z.string(), z.number().min(-50).max(50))
    .optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  field: z.string().optional(),
  minScore: z.coerce.number().min(0).optional(),
  maxScore: z.coerce.number().max(200).optional(),
  sortBy: z.enum(['score_desc', 'score_asc', 'name_asc', 'hindex_desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ═══════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════

describe('API Validation Schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid registration data', () => {
      const data = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      };
      const result = registerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('accepts registration with optional fields', () => {
      const data = {
        name: 'Test User',
        email: 'test@tsinghua.edu.cn',
        password: 'securePassword123',
        institution: 'Tsinghua University',
        researchFields: 'AI, Machine Learning',
      };
      const result = registerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = registerSchema.safeParse({
        name: '',
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'not-an-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password (< 8 chars)', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'test@example.com',
        password: '1234567',
      });
      expect(result.success).toBe(false);
    });

    it('rejects excessively long name (> 100 chars)', () => {
      const result = registerSchema.safeParse({
        name: 'A'.repeat(101),
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      const result = registerSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('signInSchema', () => {
    it('accepts valid sign-in data', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: 'mypassword',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = signInSchema.safeParse({
        email: 'not-valid',
        password: 'password',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('eduEmailSchema', () => {
    it('accepts .edu email', () => {
      const result = eduEmailSchema.safeParse({
        eduEmail: 'student@mit.edu',
      });
      expect(result.success).toBe(true);
    });

    it('accepts .edu.cn email', () => {
      const result = eduEmailSchema.safeParse({
        eduEmail: 'student@tsinghua.edu.cn',
      });
      expect(result.success).toBe(true);
    });

    it('accepts .edu.hk email', () => {
      const result = eduEmailSchema.safeParse({
        eduEmail: 'researcher@cuhk.edu.hk',
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-edu email', () => {
      const result = eduEmailSchema.safeParse({
        eduEmail: 'user@gmail.com',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email format', () => {
      const result = eduEmailSchema.safeParse({
        eduEmail: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPersonSchema', () => {
    it('accepts minimal valid person data', () => {
      const result = createPersonSchema.safeParse({
        nameZh: '张三',
        fieldSlugs: ['ai-machine-learning'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts full person data', () => {
      const result = createPersonSchema.safeParse({
        nameZh: '张三',
        nameEn: 'San Zhang',
        title: 'Professor',
        institution: 'Tsinghua University',
        department: 'Computer Science',
        orcidId: '0000-0001-2345-6789',
        googleScholarId: 'abc123',
        email: 'zhangsan@tsinghua.edu.cn',
        website: 'https://example.com/profile',
        bioZh: '研究人工智能',
        bioEn: 'Researches AI',
        fieldSlugs: ['ai-machine-learning', 'nlp'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid ORCID format', () => {
      const result = createPersonSchema.safeParse({
        nameZh: 'Test',
        fieldSlugs: ['ai'],
        orcidId: 'not-an-orcid',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid ORCID with X checksum', () => {
      const result = createPersonSchema.safeParse({
        nameZh: 'Test',
        fieldSlugs: ['ai'],
        orcidId: '0000-0001-2345-678X',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid website URL', () => {
      const result = createPersonSchema.safeParse({
        nameZh: 'Test',
        fieldSlugs: ['ai'],
        website: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty fieldSlugs', () => {
      const result = createPersonSchema.safeParse({
        nameZh: 'Test',
        fieldSlugs: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createReportSchema', () => {
    it('accepts valid report', () => {
      const result = createReportSchema.safeParse({
        personId: 'person123',
        category: 'ACADEMIC_MISCONDUCT',
        title: 'Data fabrication in 2023 paper',
        description:
          'The researcher published fabricated data in their 2023 Nature paper. Evidence attached shows manipulated figures.',
        severity: 4,
      });
      expect(result.success).toBe(true);
    });

    it('rejects short title (< 5 chars)', () => {
      const result = createReportSchema.safeParse({
        personId: 'person123',
        category: 'ACADEMIC_MISCONDUCT',
        title: 'Bad',
        description: 'This is a very detailed description of the issue that I observed...',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short description (< 50 chars)', () => {
      const result = createReportSchema.safeParse({
        personId: 'person123',
        category: 'ACADEMIC_MISCONDUCT',
        title: 'Data fabrication found',
        description: 'Too short',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid category', () => {
      const result = createReportSchema.safeParse({
        personId: 'person123',
        category: 'INVALID_CATEGORY',
        title: 'A valid title here',
        description: 'A sufficient description of at least fifty characters to pass validation.',
      });
      expect(result.success).toBe(false);
    });

    it('rejects severity outside 1-5 range', () => {
      const result = createReportSchema.safeParse({
        personId: 'person123',
        category: 'OTHER',
        title: 'A valid title',
        description: 'A sufficient description of at least fifty characters to pass validation here.',
        severity: 6,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('reviewReportSchema', () => {
    it('accepts APPROVE with score deltas', () => {
      const result = reviewReportSchema.safeParse({
        action: 'APPROVE',
        notes: 'Well-documented report',
        categoryDeltas: {
          RESEARCH_QUALITY: -10,
          METHODOLOGY_RIGOR: -5,
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts REJECT without deltas', () => {
      const result = reviewReportSchema.safeParse({
        action: 'REJECT',
        notes: 'Insufficient evidence',
      });
      expect(result.success).toBe(true);
    });

    it('rejects delta outside ±50 range', () => {
      const result = reviewReportSchema.safeParse({
        action: 'APPROVE',
        categoryDeltas: { RESEARCH_QUALITY: 60 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid action', () => {
      const result = reviewReportSchema.safeParse({
        action: 'DELETE',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('searchQuerySchema', () => {
    it('accepts basic search', () => {
      const result = searchQuerySchema.safeParse({ q: 'machine learning' });
      expect(result.success).toBe(true);
    });

    it('accepts full search with all filters', () => {
      const result = searchQuerySchema.safeParse({
        q: 'neural network',
        field: 'ai-machine-learning',
        minScore: '80',
        maxScore: '120',
        sortBy: 'hindex_desc',
        page: '1',
        limit: '20',
      });
      expect(result.success).toBe(true);
    });

    it('coerces string numbers', () => {
      const result = searchQuerySchema.safeParse({
        q: 'test',
        minScore: '50',
        page: '3',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.minScore).toBe(50);
        expect(result.data.page).toBe(3);
      }
    });

    it('rejects empty query', () => {
      const result = searchQuerySchema.safeParse({ q: '' });
      expect(result.success).toBe(false);
    });

    it('rejects page less than 1', () => {
      const result = searchQuerySchema.safeParse({ q: 'test', page: '0' });
      expect(result.success).toBe(false);
    });
  });
});
