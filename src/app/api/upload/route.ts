import { NextRequest } from 'next/server';
import { apiSuccess, apiError, unauthorized } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if ((session.user as any).role !== 'COMMUNITY' && (session.user as any).role !== 'ADMIN') {
    return apiError(403, 'FORBIDDEN', 'Only community participants and admins can upload files');
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return apiError(400, 'VALIDATION_ERROR', 'No file provided');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return apiError(400, 'VALIDATION_ERROR', 'File too large. Maximum size is 10MB.');
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF, PDF.');
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin';
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads');

    // Ensure upload directory exists
    await mkdir(uploadDir, { recursive: true });

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);

    // Create evidence record in database
    const evidenceType = file.type.startsWith('image/') ? 'IMAGE'
      : file.type === 'application/pdf' ? 'PDF'
      : 'DOCUMENT';

    const evidence = await prisma.reportEvidence.create({
      data: {
        reportId: '', // Will be linked when report is created
        type: evidenceType as any,
        url: `/uploads/${uniqueName}`,
        fileName: file.name,
        fileSize: file.size,
      },
    });

    return apiSuccess({
      id: evidence.id,
      url: `/uploads/${uniqueName}`,
      fileName: file.name,
      type: evidenceType,
    }, 201);
  } catch (error) {
    console.error('Upload error:', error);
    return apiError(500, 'UPLOAD_FAILED', 'File upload failed');
  }
}
