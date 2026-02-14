import { bigint, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { clusters } from './clusters.js'

export const nodes = pgTable('nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => clusters.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('Unknown'), // Ready/NotReady/Unknown
  role: varchar('role', { length: 50 }).notNull().default('worker'), // control-plane/worker
  cpuCapacity: integer('cpu_capacity'), // millicores
  cpuAllocatable: integer('cpu_allocatable'), // millicores
  memoryCapacity: bigint('memory_capacity', { mode: 'number' }), // bytes
  memoryAllocatable: bigint('memory_allocatable', { mode: 'number' }), // bytes
  podsCount: integer('pods_count').notNull().default(0),
  k8sVersion: varchar('k8s_version', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
