import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { clusters } from './clusters.js'

export const healthHistory = pgTable('health_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(), // healthy/degraded/critical/unknown
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  responseTimeMs: integer('response_time_ms'),
  details: text('details'), // JSON string
})
