import { auth } from './auth.js'

const DEFAULT_ADMIN_EMAIL = 'admin@voyager.local'
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const DEFAULT_ADMIN_NAME = 'Voyager Admin'

const internalHeaders = new Headers({ 'x-internal-seed': 'true' })

type BetterAuthUser = {
  id: string
  email: string
  role?: string | null
}

export async function ensureAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD
  const adminName = process.env.ADMIN_NAME ?? DEFAULT_ADMIN_NAME

  const existingUsers = await auth.api
    .listUsers({
      headers: internalHeaders,
      query: { limit: 100 },
    })
    .catch(() => ({ users: [] as BetterAuthUser[] }))

  const existing = existingUsers.users?.find((user) => user.email === adminEmail)

  if (existing) {
    if (existing.role !== 'admin') {
      await auth.api.setRole({
        headers: internalHeaders,
        body: { userId: existing.id, role: 'admin' },
      })
    }
    return
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: adminEmail,
      password: adminPassword,
      name: adminName,
    },
  })

  if (!result?.user?.id) {
    throw new Error('Failed to create admin user — no user returned')
  }

  await auth.api.setRole({
    headers: internalHeaders,
    body: { userId: result.user.id, role: 'admin' },
  })
}
