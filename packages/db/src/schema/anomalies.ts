import { boolean, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { clusters } from './clusters.js'

export const anomalySeverityEnum = pgEnum('anomaly_severity', ['critical', 'warning', 'info'])

export const anomalies = pgTable('anomalies', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 64 }).notNull(),
  severity: anomalySeverityEnum('severity').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: varchar('description', { length: 2000 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})

export const anomalyRules = pgTable('anomaly_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  metric: varchar('metric', { length: 64 }).notNull(),
  operator: varchar('operator', { length: 16 }).notNull().default('gt'),
  threshold: varchar('threshold', { length: 64 }).notNull(),
  severity: anomalySeverityEnum('severity').notNull().default('warning'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
