import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const pool = new pg.Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
  // statement_timeout is a Postgres session parameter, not a pg.Pool option.
  // Pass it via the options string (libpq-style) to set it on every connection.
  options: '-c statement_timeout=30000',
})

pool.on('error', (err) => console.error('[pg-pool] Unexpected error on idle client', err))

export const db = drizzle(pool, { schema })
export type Database = typeof db

export async function closeDatabase(): Promise<void> {
  await pool.end()
}
