import { boolean, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  metric: varchar('metric', { length: 50 }).notNull(), // cpu, memory, pods, restarts
  operator: varchar('operator', { length: 10 }).notNull(), // gt, lt, eq
  threshold: numeric('threshold').notNull(),
  clusterFilter: varchar('cluster_filter', { length: 255 }),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const alertHistory = pgTable('alert_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  alertId: uuid('alert_id')
    .notNull()
    .references(() => alerts.id, { onDelete: 'cascade' }),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  value: numeric('value').notNull(),
  message: varchar('message', { length: 1000 }).notNull(),
  acknowledged: boolean('acknowledged').notNull().default(false),
})
