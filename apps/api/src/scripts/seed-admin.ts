/**
 * Seed admin user via Better-Auth API.
 * Usage: tsx apps/api/src/scripts/seed-admin.ts
 *
 * Creates admin@voyager.local with role=admin using Better-Auth's
 * server-side API (no HTTP server required).
 */
import { ensureAdminUser } from '../lib/ensure-admin-user.js'

async function seedAdmin() {
  console.log('🌱 Seeding admin user via Better-Auth...')
  await ensureAdminUser()
  console.log('🎉 Admin seed complete!')
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Admin seed failed:', err)
    process.exit(1)
  })
