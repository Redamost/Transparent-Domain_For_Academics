// ─── Security Headers ───
// CSP, XSS protection, and other security-related HTTP headers.

/**
 * Generate Content Security Policy header value.
 * Allows: self, Google Scholar, ORCID, ResearchGate, arXiv, inline styles for Tailwind.
 */
export function getCspHeader(): string {
  const csp = [
    "default-src 'self'",
    // Scripts: self + next-auth inline scripts + Google Scholar widget
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Styles: self + inline (Tailwind requires this in dev)
    "style-src 'self' 'unsafe-inline'",
    // Images: self + data URIs + external scholar/ORCID avatars
    "img-src 'self' data: https: blob:",
    // Fonts: self + Google Fonts
    "font-src 'self' https://fonts.gstatic.com",
    // Connect: API calls to self + external research APIs
    "connect-src 'self' https://pub.orcid.org https://export.arxiv.org https://scholar.google.com https://www.researchgate.net",
    // Frames: none (no embedding)
    "frame-src 'none'",
    // Object: none
    "object-src 'none'",
    // Base URI: self
    "base-uri 'self'",
    // Form action: self
    "form-action 'self'",
  ].join('; ');

  return csp;
}

/**
 * All security headers as a Record.
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    // Content Security Policy
    'Content-Security-Policy': getCspHeader(),
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',
    // Enable browser XSS filter
    'X-XSS-Protection': '1; mode=block',
    // Referrer policy: only send origin for cross-origin
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Permissions: restrict powerful features
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'interest-cohort=()', // Disable FLoC
    ].join(', '),
    // Strict Transport Security (only in production, set by Vercel/nginx)
    // 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  };
}

/**
 * Apply security headers to a Next.js Response.
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = getSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * XSS sanitization: escape HTML entities in user-provided strings.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize a URL to prevent javascript: and data: injection.
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only allow http: and https: protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    // Not a valid URL
    return null;
  }
}

/**
 * Simple CSRF token generator (for forms).
 * In production, use a proper CSRF library.
 */
export function generateCsrfToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 32; i++) {
    token += chars[randomValues[i] % chars.length];
  }
  return token;
}
