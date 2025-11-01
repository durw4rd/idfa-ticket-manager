/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    // Copy pdfjs worker to public directory during build
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }
    return config;
  },
  async headers() {
    // Match all background images
    const backgroundPatterns = [
      '/bcg-carre.png',
      '/bcg-debalie.png',
      '/bcg-eye.png',
      '/bcg-ketelhuis.png',
      '/bcg-kriterion.png',
      '/bcg-pulse.png',
      '/bcg-rialto.png',
      '/bcg-spiegel.png',
      '/bcg-tuschinski.png',
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

