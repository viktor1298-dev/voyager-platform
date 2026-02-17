import { jsonb, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const dashboardVisibilityEnum = pgEnum('dashboard_visibility', ['private', 'team', 'public'])
export const dashboardCollaboratorRoleEnum = pgEnum('dashboard_collaborator_role', ['viewer', 'editor', 'owner'])

export const sharedDashboards = pgTable('shared_dashboards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  config: jsonb('config').$type<{ layout?: unknown; widgets?: unknown; filters?: unknown }>().notNull(),
  visibility: dashboardVisibilityEnum('visibility').notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dashboardCollaborators = pgTable(
  'dashboard_collaborators',
  {
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => sharedDashboards.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: dashboardCollaboratorRoleEnum('role').notNull().default('viewer'),
  },
  (table) => [primaryKey({ columns: [table.dashboardId, table.userId] })],
)
