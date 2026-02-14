import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      JWT_SECRET: 'test-secret',
      ADMIN_PASSWORD: 'test-pass',
      DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
    },
  },
})
