/**
 * Seed admin user via Better-Auth API.
 * Usage: tsx apps/api/src/scripts/seed-admin.ts
 *
 * Creates admin@voyager.local with role=admin using Better-Auth's
 * server-side API (no HTTP server required).
 */
import { auth } from '../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@voyager.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Voyager Admin'

// Internal headers for server-side admin API calls
const internalHeaders = new Headers({ 'x-internal-seed': 'true' })

async function seedAdmin() {
  console.log('🌱 Seeding admin user via Better-Auth...')

  // Check if user already exists
  const existingUsers = await auth.api.listUsers({
    headers: internalHeaders,
    query: { limit: 100 },
  }).catch(() => ({ users: [] }))

  const existing = existingUsers.users?.find(
    (u: { email: string }) => u.email === ADMIN_EMAIL,
  )

  if (existing) {
    console.log(`ℹ️  User ${ADMIN_EMAIL} already exists (id: ${existing.id})`)

    // Ensure admin role is set
    if (existing.role !== 'admin') {
      await auth.api.setRole({
        headers: internalHeaders,
        body: { userId: existing.id, role: 'admin' },
      })
      console.log('✅ Updated role to admin')
    } else {
      console.log('✅ Already has admin role')
    }
    return
  }

  // Create user via Better-Auth server API
  const result = await auth.api.signUpEmail({
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
    },
  })

  if (!result?.user?.id) {
    throw new Error('Failed to create admin user — no user returned')
  }

  console.log(`✅ Created user: ${result.user.email} (id: ${result.user.id})`)

  // Set admin role via admin plugin
  await auth.api.setRole({
    headers: internalHeaders,
    body: { userId: result.user.id, role: 'admin' },
  })

  console.log('✅ Assigned admin role')
  console.log('🎉 Admin seed complete!')
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Admin seed failed:', err)
    process.exit(1)
  })
