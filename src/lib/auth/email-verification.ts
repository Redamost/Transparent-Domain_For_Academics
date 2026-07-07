import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * Generate a unique verification token and store it.
 */
export async function generateEduVerificationToken(email: string): Promise<string> {
  // Remove any existing tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier: `edu-verify:${email}` },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.verificationToken.create({
    data: {
      identifier: `edu-verify:${email}`,
      token,
      expires,
    },
  });

  return token;
}

/**
 * Validate the EDU email token and upgrade user role.
 */
export async function verifyEduEmail(token: string): Promise<{ success: boolean; message: string; userId?: string }> {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record) {
    return { success: false, message: 'Invalid or expired verification token' };
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } });
    return { success: false, message: 'Verification token has expired. Please request a new one.' };
  }

  const email = record.identifier.replace('edu-verify:', '');

  // Check if this EDU email is already verified by another user
  const existingUser = await prisma.user.findFirst({
    where: { eduEmail: email, eduEmailVerified: { not: null } },
  });

  if (existingUser) {
    await prisma.verificationToken.delete({ where: { token } });
    return { success: false, message: 'This EDU email is already verified by another account' };
  }

  // Find the user who requested this verification
  const user = await prisma.user.findFirst({
    where: { eduEmail: email },
  });

  if (!user) {
    return { success: false, message: 'User not found' };
  }

  // Update user: verify EDU email and upgrade to COMMUNITY
  await prisma.user.update({
    where: { id: user.id },
    data: {
      eduEmailVerified: new Date(),
      role: 'COMMUNITY',
    },
  });

  // Clean up token
  await prisma.verificationToken.delete({ where: { token } });

  return { success: true, message: 'EDU email verified. Your role has been upgraded to Community Participant.', userId: user.id };
}

/**
 * Check if an EDU email domain is in the whitelist or is a known university domain.
 */
export function isValidEduDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  // .edu domains are inherently vetted by EDUCAUSE
  if (domain.endsWith('.edu') || domain.endsWith('.edu.cn')) {
    return true;
  }

  return false;
}

/**
 * Generate a regular email verification token.
 */
export async function generateEmailVerificationToken(email: string): Promise<string> {
  await prisma.verificationToken.deleteMany({
    where: { identifier: `email-verify:${email}` },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: `email-verify:${email}`,
      token,
      expires,
    },
  });

  return token;
}

/**
 * Verify a regular email token.
 */
export async function verifyEmail(token: string): Promise<boolean> {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record || record.expires < new Date()) {
    return false;
  }

  const email = record.identifier.replace('email-verify:', '');

  await prisma.user.updateMany({
    where: { email, emailVerified: null },
    data: { emailVerified: new Date() },
  });

  await prisma.verificationToken.delete({ where: { token } });
  return true;
}
