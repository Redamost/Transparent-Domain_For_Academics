import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiSuccess, apiError, unauthorized } from '@/lib/api/errors';
import {
  generateFieldFeed,
  generatePersonalizedFeed,
  generatePersonFeed,
} from '@/lib/feed/enricher';
import { searchPapersByTopic } from '@/lib/feed/arxiv';
import { prisma } from '@/lib/prisma';

// GET /api/feed?type=field&slug=ai-machine-learning
// GET /api/feed?type=person&id=xxx
// GET /api/feed?type=personalized  (requires auth)
// GET /api/feed?type=search&q=transformer
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type') || 'field';
  const maxItems = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  try {
    switch (type) {
      case 'field': {
        const slug = searchParams.get('slug');
        if (!slug) {
          return apiError(400, 'MISSING_PARAM', 'Field slug is required');
        }
        const items = await generateFieldFeed(slug, maxItems);
        return apiSuccess(items);
      }

      case 'person': {
        const id = searchParams.get('id');
        if (!id) {
          return apiError(400, 'MISSING_PARAM', 'Person ID is required');
        }
        const items = await generatePersonFeed(id, maxItems);
        return apiSuccess(items);
      }

      case 'personalized': {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
          return unauthorized();
        }

        // Get user's monitored fields from their profile
        const user = await prisma.user.findUnique({
          where: { id: (session.user as any).id },
          select: { researchFields: true },
        });

        const fieldSlugs = user?.researchFields
          ? user.researchFields.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

        // If user has no fields set, default to top-level fields
        if (fieldSlugs.length === 0) {
          const topFields = await prisma.field.findMany({
            where: { level: 0 },
            select: { slug: true },
            take: 5,
          });
          fieldSlugs.push(...topFields.map((f) => f.slug));
        }

        const items = await generatePersonalizedFeed(fieldSlugs, maxItems);
        return apiSuccess(items);
      }

      case 'search': {
        const q = searchParams.get('q');
        if (!q || q.length < 2) {
          return apiError(400, 'MISSING_PARAM', 'Search query is required (min 2 chars)');
        }
        const papers = await searchPapersByTopic(q, maxItems);
        return apiSuccess(papers);
      }

      default:
        return apiError(400, 'INVALID_TYPE', `Unknown feed type: ${type}`);
    }
  } catch (error) {
    console.error('[Feed API] Error:', error);
    return apiError(500, 'FEED_ERROR', 'Failed to fetch feed');
  }
}
