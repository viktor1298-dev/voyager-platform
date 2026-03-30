import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    userEmail: text('user_email'),
    action: varchar('action', { length: 100 }).notNull(),
    resource: varchar('resource', { length: 100 }).notNull(),
    resourceId: text('resource_id'),
    details: text('details'),
    ipAddress: varchar('ip_address', { length: 45 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_log_timestamp').on(table.timestamp),
    index('idx_audit_log_resource_id').on(table.resourceId, table.timestamp),
  ],
)
