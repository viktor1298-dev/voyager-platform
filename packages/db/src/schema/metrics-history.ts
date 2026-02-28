import { integer, pgTable, real, timestamp, uuid } from 'drizzle-orm/pg-core'
import { clusters } from './clusters.js'

export const metricsHistory = pgTable('metrics_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  cpuPercent: real('cpu_percent').notNull(),
  memPercent: real('mem_percent').notNull(),
  podCount: integer('pod_count').notNull().default(0),
  nodeCount: integer('node_count').notNull().default(0),
})
