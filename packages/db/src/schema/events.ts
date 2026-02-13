import { jsonb, pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { clusters } from './clusters'

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().notNull(),
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => clusters.id, { onDelete: 'cascade' }),
    namespace: varchar('namespace', { length: 255 }),
    kind: varchar('kind', { length: 50 }).notNull(), // Warning/Normal
    reason: varchar('reason', { length: 255 }),
    message: text('message'),
    source: varchar('source', { length: 255 }),
    involvedObject: jsonb('involved_object'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.id, table.timestamp] })],
)
