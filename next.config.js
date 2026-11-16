// `vercel env pull` writes VERCEL_URL="" into .env.local. next-auth/react falls back to VERCEL_URL
// when NEXTAUTH_URL is unset and can't parse an empty string, which fails local builds. Locally,
// default to localhost; on Vercel VERCEL_URL is set and this does nothing (see lib/auth.ts).
if (!process.env.NEXTAUTH_URL && !process.env.VERCEL_URL) {
  delete process.env.VERCEL_URL;
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep visited pages in the client router cache for 30s, so flipping between tabs is instant.
    // router.refresh() after a save clears it, so your own changes still show straight away.
    staleTimes: { dynamic: 30 },
  },
  async redirects() {
    // The sharing page became Crew in the 2026 redesign
    return [{ source: '/settings', destination: '/crew', permanent: true }];
  },
  async headers() {
    // Match all background images
    const backgroundPatterns = [
      '/bcg-carre.webp',
      '/bcg-debalie.webp',
      '/bcg-eye.webp',
      '/bcg-ketelhuis.webp',
      '/bcg-kriterion.webp',
      '/bcg-pulse.webp',
      '/bcg-rialto.webp',
      '/bcg-spiegel.webp',
      '/bcg-tuschinski.webp',
    ];

    return backgroundPatterns.map((source) => ({
      source,
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    }));
  },
}

module.exports = nextConfig

