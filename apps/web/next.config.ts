import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  compress: true,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/trpc/:path*',
        destination: 'http://voyager-api:4000/trpc/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://voyager-api:4000/api/:path*',
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
