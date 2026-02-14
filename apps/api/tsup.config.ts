import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  sourcemap: 'hidden',
  clean: true,
  treeshake: true,
  minify: false,
  noExternal: [/.*/],
  external: ['@sentry/profiling-node', 'zod', 'trpc-to-openapi'],
})
