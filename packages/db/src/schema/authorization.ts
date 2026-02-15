import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const subjectTypeEnum = pgEnum('subject_type', ['user', 'team', 'role'])
export const relationEnum = pgEnum('relation', ['owner', 'admin', 'editor', 'viewer'])
export const objectTypeEnum = pgEnum('object_type', ['cluster', 'deployment', 'namespace', 'alert'])
export const teamMemberRoleEnum = pgEnum('team_member_role', ['admin', 'member'])

export const accessRelations = pgTable(
  'relations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    relation: relationEnum('relation').notNull(),
    objectType: objectTypeEnum('object_type').notNull(),
    objectId: text('object_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => ({
    subjectLookupIdx: index('relations_subject_lookup_idx').on(table.subjectType, table.subjectId),
    objectLookupIdx: index('relations_object_lookup_idx').on(table.objectType, table.objectId),
    relationLookupIdx: index('relations_relation_lookup_idx').on(
      table.subjectType,
      table.subjectId,
      table.objectType,
      table.objectId,
      table.relation,
    ),
    relationUniqueIdx: uniqueIndex('relations_subject_object_relation_unq').on(
      table.subjectType,
      table.subjectId,
      table.relation,
      table.objectType,
      table.objectId,
    ),
  }),
)

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: teamMemberRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId], name: 'team_members_pk' }),
    userLookupIdx: index('team_members_user_lookup_idx').on(table.userId),
  }),
)
