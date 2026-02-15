import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const ssoProviders = pgTable(
  'sso_providers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerType: varchar('provider_type', { length: 50 }).notNull(),
    tenantId: text('tenant_id').notNull(),
    clientId: text('client_id').notNull(),
    encryptedClientSecret: text('encrypted_client_secret'),
    enabled: boolean('enabled').notNull().default(true),
    groupMappings: jsonb('group_mappings').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    providerTypeUniqueIdx: uniqueIndex('sso_providers_provider_type_unq').on(table.providerType),
  }),
)
