import { generateOpenApiDocument } from 'trpc-to-openapi'
import { appRouter } from '../routers/index.js'

async function main() {
  try {
    const doc = generateOpenApiDocument(appRouter, {
      title: 'Debug',
      version: '0.0.0',
      baseUrl: 'http://localhost:4000',
    })

    console.log('OpenAPI generated successfully')
    console.log('paths:', Object.keys(doc.paths ?? {}).length)
  } catch (error) {
    console.error('OpenAPI generation failed')
    console.error(error)
    process.exitCode = 1
  }
}

void main()
