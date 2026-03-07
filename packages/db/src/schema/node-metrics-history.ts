import { index, integer, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { clusters } from './clusters.js'

export const nodeMetricsHistory = pgTable('node_metrics_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  nodeName: text('node_name').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  cpuPercent: real('cpu_percent').notNull(),
  memPercent: real('mem_percent').notNull(),
  cpuMillis: integer('cpu_millis').notNull().default(0),
  memMi: integer('mem_mi').notNull().default(0),
}, (table) => [
  index('idx_node_metrics_cluster_ts').on(table.clusterId, table.timestamp),
  index('idx_node_metrics_node').on(table.clusterId, table.nodeName, table.timestamp),
])
