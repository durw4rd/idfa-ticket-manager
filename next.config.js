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

