import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/config.ts');

const nextConfig: NextConfig = {
  // Keep native Node.js packages external — they cannot be bundled by Turbopack
  serverExternalPackages: ['playwright', 'playwright-core'],
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'scholar.google.com' },
      { protocol: 'https', hostname: 'www.researchgate.net' },
      { protocol: 'https', hostname: 'orcid.org' },
    ],
  },
};

export default withNextIntl(nextConfig);
