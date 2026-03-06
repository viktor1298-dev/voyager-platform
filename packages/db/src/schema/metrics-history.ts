import { bigint, index, integer, pgTable, real, timestamp, uuid } from 'drizzle-orm/pg-core'
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
  /** M-P3-002: Network I/O bytes per second (nullable — populated from K8s metrics-server when available) */
  networkBytesIn: bigint('network_bytes_in', { mode: 'number' }).default(0),
  networkBytesOut: bigint('network_bytes_out', { mode: 'number' }).default(0),
}, (table) => [
  index('idx_metrics_history_cluster_ts').on(table.clusterId, table.timestamp),
])
