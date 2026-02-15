import { integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// Canonical provider IDs shared with API/web payloads.
export const clusterProviderEnum = pgEnum('cluster_provider', [
  'kubeconfig',
  'aws-eks',
  'azure-aks',
  'google-gke',
  'minikube',
])

export const clusterEnvironmentEnum = pgEnum('cluster_environment', ['production', 'staging', 'development'])

export const clusterHealthStatusEnum = pgEnum('cluster_health_status', [
  'healthy',
  'degraded',
  'critical',
  'unreachable',
  'unknown',
])

export const clusters = pgTable('clusters', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  provider: clusterProviderEnum('provider').notNull().default('kubeconfig'),
  environment: clusterEnvironmentEnum('environment').notNull().default('development'),
  endpoint: varchar('endpoint', { length: 500 }),
  // TODO(security): Store connection_config encrypted-at-rest (field-level encryption / KMS) before production.
  // Placeholder: keep only non-sensitive refs here (e.g. credentialRef), never raw credentials.
  connectionConfig: jsonb('connection_config').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 50 }).notNull().default('unreachable'),
  healthStatus: clusterHealthStatusEnum('health_status').notNull().default('unknown'),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  version: varchar('version', { length: 50 }),
  nodesCount: integer('nodes_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
