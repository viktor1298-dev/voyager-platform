import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const dashboardLayouts = pgTable('dashboard_layouts', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  layout: jsonb('layout').notNull().$type<{ widgets: unknown[]; layouts: Record<string, unknown[]> }>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
