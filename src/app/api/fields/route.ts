import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createFieldSchema } from '@/lib/api/validation';
import { apiSuccess, unauthorized, validationError } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const fields = await prisma.field.findMany({
    where: { level: 0 },
    orderBy: { sortOrder: 'asc' },
    include: {
      children: {
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { persons: true } },
        },
      },
      _count: { select: { persons: true } },
    },
  });

  return apiSuccess(fields);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if ((session.user as any).role !== 'ADMIN') {
    return unauthorized('Only admins can manage fields');
  }

  const body = await req.json();
  const parsed = createFieldSchema.safeParse(body);
  if (!parsed.success) {
    return validationError('Invalid input', parsed.error.flatten());
  }

  const { parentId, ...data } = parsed.data;

  // Calculate level if parent is specified
  let level = 0;
  if (parentId) {
    const parent = await prisma.field.findUnique({ where: { id: parentId } });
    if (parent) level = parent.level + 1;
  }

  const field = await prisma.field.create({
    data: { ...data, parentId, level },
  });

  return apiSuccess(field, 201);
}
