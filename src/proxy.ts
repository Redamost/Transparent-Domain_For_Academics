import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routing } from '@/lib/i18n/routing';
import type { RateLimitConfig } from '@/lib/security/rate-limit';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  RATE_LIMITS,
} from '@/lib/security/rate-limit';
import { getSecurityHeaders } from '@/lib/security/headers';

const intlMiddleware = createMiddleware(routing);

/**
 * Proxy handler — Next.js 16 replaces middleware.ts with proxy.ts.
 *
 * Features:
 *  1. i18n locale routing (next-intl)
 *  2. Auth protection for /dashboard/* and /admin/* routes
 *  3. Rate limiting for API routes
 *  4. Security headers (CSP, XSS, etc.) applied to all responses
 */

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ─── Auth protection for protected pages ───
  const isProtectedPage =
    /^\/(zh|en)\/dashboard/.test(pathname) ||
    /^\/(zh|en)\/admin/.test(pathname);

  if (isProtectedPage) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const locale = pathname.startsWith('/en') ? 'en' : 'zh';
      const signInUrl = new URL(`/${locale}/auth/signin`, req.url);
      signInUrl.searchParams.set('callbackUrl', req.url);
      return applySecurityHeadersToResponse(NextResponse.redirect(signInUrl));
    }
  }

  // ─── Rate Limiting for API Routes ───
  if (pathname.startsWith('/api/')) {
    let rateLimitConfig: RateLimitConfig = RATE_LIMITS.API;

    // Auth endpoints: stricter limits
    if (pathname.startsWith('/api/auth/')) {
      rateLimitConfig = RATE_LIMITS.AUTH;
    }
    // Report endpoints: moderate limits
    else if (pathname.startsWith('/api/reports')) {
      rateLimitConfig = RATE_LIMITS.REPORT;
    }
    // Upload endpoints: moderate limits
    else if (pathname.startsWith('/api/upload')) {
      rateLimitConfig = RATE_LIMITS.UPLOAD;
    }
    // Search endpoints
    else if (pathname.startsWith('/api/search')) {
      rateLimitConfig = RATE_LIMITS.SEARCH;
    }

    const identifier = getRateLimitIdentifier(req);
    const result = checkRateLimit(identifier, rateLimitConfig);

    if (!result.allowed) {
      const response = NextResponse.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            retryAfter: result.retryAfter,
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
          },
        }
      );
      return applySecurityHeadersToResponse(response);
    }

    // API routes bypass i18n middleware — they don't need locale prefixing
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(rateLimitConfig.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));

    return applySecurityHeadersToResponse(response);
  }

  // ─── Non-API Routes: i18n routing only ───
  const response = intlMiddleware(req);
  return applySecurityHeadersToResponse(response);
}

/**
 * Apply security headers to a NextResponse.
 */
function applySecurityHeadersToResponse(response: NextResponse): NextResponse {
  const securityHeaders = getSecurityHeaders();
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next|_vercel|.*\\..*).*)',
    '/api/:path*',
  ],
};
