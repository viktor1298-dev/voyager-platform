import { desc } from 'drizzle-orm'
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { user } from './auth.js'
import { clusters } from './clusters.js'

export const aiRecommendationSeverityEnum = pgEnum('ai_recommendation_severity', [
  'critical',
  'warning',
  'info',
])
export const aiRecommendationStatusEnum = pgEnum('ai_recommendation_status', [
  'open',
  'dismissed',
  'resolved',
])

export const aiProviderEnum = pgEnum('ai_provider', ['openai', 'anthropic'])

export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  messages: jsonb('messages')
    .$type<Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>>()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const aiThreads = pgTable(
  'ai_threads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => clusters.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    provider: aiProviderEnum('provider').notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_ai_threads_user_created').on(table.userId, desc(table.createdAt)),
    index('idx_ai_threads_cluster_created').on(table.clusterId, desc(table.createdAt)),
  ],
)

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => aiThreads.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).$type<'system' | 'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    provider: aiProviderEnum('provider').notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_ai_messages_thread_created').on(table.threadId, desc(table.createdAt))],
)

export const aiRecommendations = pgTable('ai_recommendations', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  severity: aiRecommendationSeverityEnum('severity').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  action: text('action').notNull(),
  status: aiRecommendationStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
