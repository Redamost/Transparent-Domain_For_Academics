import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, notFound } from '@/lib/api/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const field = await prisma.field.findUnique({
    where: { slug },
    include: {
      parent: true,
      children: {
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: { select: { persons: true } },
          children: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      _count: { select: { persons: true } },
    },
  });

  if (!field) return notFound('Field');

  return apiSuccess(field);
}
