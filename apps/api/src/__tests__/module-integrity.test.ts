import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('api module integrity', () => {
  it('keeps ensure-admin-user module referenced by server import', () => {
    const serverPath = resolve(__dirname, '../server.ts')
    const serverSource = readFileSync(serverPath, 'utf8')
    expect(serverSource).toContain("./lib/ensure-admin-user.js")

    const ensureAdminUserPath = resolve(__dirname, '../lib/ensure-admin-user.ts')
    expect(existsSync(ensureAdminUserPath)).toBe(true)
  })
})
