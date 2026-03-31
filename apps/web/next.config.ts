import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://voyager-api:4000'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  compress: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    viewTransition: true,
    optimizePackageImports: ['lucide-react', 'recharts', '@iconify/react', '@xyflow/react'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/trpc/:path*',
        destination: `${apiUrl}/trpc/:path*`,
      },
      {
        source: '/api/:path((?!resources/stream|metrics/stream|logs/stream).*)',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

// Only apply Sentry wrapper if DSN is configured
const config = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig

export default config
