import { generateOpenApiDocument } from 'trpc-to-openapi'
import type { AppRouter } from '../routers/index.js'
import { appRouter } from '../routers/index.js'

export function getOpenApiBaseUrl(): string {
  if (process.env.OPENAPI_BASE_URL) return process.env.OPENAPI_BASE_URL

  const host = process.env.HOST ?? '0.0.0.0'
  const port = process.env.PORT ?? '4000'
  const protocol = process.env.OPENAPI_PROTOCOL ?? 'http'

  const normalizedHost = host === '0.0.0.0' ? 'localhost' : host
  return `${protocol}://${normalizedHost}:${port}`
}

export function generateOpenApiSpec() {
  return generateOpenApiDocument<AppRouter>(appRouter, {
    title: 'Voyager API',
    description: 'OpenAPI schema generated from tRPC routers',
    version: '1.0.0',
    baseUrl: getOpenApiBaseUrl(),
    tags: ['clusters', 'health', 'deployments', 'events', 'audit', 'features'],
  })
}
