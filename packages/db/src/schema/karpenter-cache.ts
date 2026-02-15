import { index, jsonb, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { clusters } from './clusters.js'

export const karpenterCache = pgTable(
  'karpenter_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => clusters.id, { onDelete: 'cascade' }),
    dataType: varchar('data_type', { length: 50 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clusterTypeObservedIdx: index('karpenter_cache_cluster_type_observed_idx').on(
      table.clusterId,
      table.dataType,
      table.observedAt,
    ),
    clusterDataTypeUnique: unique('karpenter_cache_cluster_data_type_uq').on(
      table.clusterId,
      table.dataType,
    ),
  }),
)
