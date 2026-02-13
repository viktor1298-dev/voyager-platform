import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://voyager:voyager_dev@localhost:5432/voyager_dev',
})

export const db = drizzle(pool, { schema })
export type Database = typeof db
