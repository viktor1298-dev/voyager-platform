CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Better-Auth tables
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT DEFAULT 'viewer',
  banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  ban_expires TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  impersonated_by TEXT
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed admin user (password: admin123, bcrypt hash)
INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
VALUES ('admin-001', 'Admin', 'admin@voyager.local', true, 'admin', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES (
  'admin-account-001',
  'admin-001',
  'credential',
  'admin-001',
  -- bcrypt hash of 'admin123'
  crypt('admin123', gen_salt('bf', 10)),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ENUMs for clusters table (migration 0002)
DO $$ BEGIN
 CREATE TYPE "public"."cluster_provider" AS ENUM('kubeconfig', 'aws', 'azure', 'gke', 'minikube');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."cluster_environment" AS ENUM('production', 'staging', 'development');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."cluster_health_status" AS ENUM('healthy', 'degraded', 'critical', 'unreachable', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  provider cluster_provider NOT NULL DEFAULT 'kubeconfig',
  endpoint VARCHAR(500),
  environment cluster_environment NOT NULL DEFAULT 'development',
  connection_config JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'unreachable',
  health_status cluster_health_status NOT NULL DEFAULT 'unknown',
  last_health_check TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  version VARCHAR(50),
  nodes_count INTEGER NOT NULL DEFAULT 0,
  credential_ref VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Unknown',
  role VARCHAR(50) NOT NULL DEFAULT 'worker',
  cpu_capacity INTEGER,
  cpu_allocatable INTEGER,
  memory_capacity BIGINT,
  memory_allocatable BIGINT,
  pods_count INTEGER NOT NULL DEFAULT 0,
  k8s_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  namespace VARCHAR(255),
  kind VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  message TEXT,
  source VARCHAR(255),
  involved_object JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, timestamp)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  metric VARCHAR(50) NOT NULL,
  operator VARCHAR(10) NOT NULL,
  threshold NUMERIC NOT NULL,
  cluster_filter VARCHAR(255),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_url VARCHAR(1000),
  last_triggered_at TIMESTAMPTZ,
  last_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value NUMERIC NOT NULL,
  message VARCHAR(1000) NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS health_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_time_ms INTEGER,
  details TEXT
);

-- SSO Providers (migration 0005)
CREATE TABLE IF NOT EXISTS "sso_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_type" varchar(50) NOT NULL,
  "tenant_id" text NOT NULL,
  "client_id" text NOT NULL,
  "encrypted_client_secret" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "group_mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sso_providers_provider_type_unq" ON "sso_providers" USING btree ("provider_type");

-- BYOK keys (migration 0011 + 0012 guards)
CREATE TABLE IF NOT EXISTS "user_ai_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" varchar(50) NOT NULL,
  "encrypted_key" text NOT NULL,
  "model" varchar(120) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_user_ai_keys_user_provider"
  ON "user_ai_keys" ("user_id", "provider");

CREATE INDEX IF NOT EXISTS "idx_user_ai_keys_user_updated"
  ON "user_ai_keys" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_ai_keys_provider_updated"
  ON "user_ai_keys" ("provider", "updated_at" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_ai_keys') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_user_ai_keys_encrypted_key_not_blank'
    ) THEN
      ALTER TABLE "user_ai_keys"
      ADD CONSTRAINT "chk_user_ai_keys_encrypted_key_not_blank"
      CHECK (btrim("encrypted_key") <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_user_ai_keys_model_not_blank'
    ) THEN
      ALTER TABLE "user_ai_keys"
      ADD CONSTRAINT "chk_user_ai_keys_model_not_blank"
      CHECK (btrim("model") <> '');
    END IF;
  END IF;
END $$;

-- Multi-provider clusters (migration 0002) — columns now inlined in CREATE TABLE above
-- migration 0011: credential_ref, is_active, last_connected_at also inlined above

-- Seed test cluster data (for E2E tests)
INSERT INTO "clusters" (id, name, provider, status, version, nodes_count, environment, connection_config, health_status, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'test-cluster-minikube',
  'minikube'::"cluster_provider",
  'healthy',
  'v1.33.0',
  1,
  'development'::"cluster_environment",
  '{"contextName": "minikube"}'::jsonb,
  'healthy'::"cluster_health_status",
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "clusters" (id, name, provider, status, version, nodes_count, environment, connection_config, health_status, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'prod-cluster-eks',
  'aws'::"cluster_provider",
  'healthy',
  'v1.32.0',
  3,
  'staging'::"cluster_environment",
  '{"region": "us-east-1", "clusterName": "prod-eks-1"}'::jsonb,
  'healthy'::"cluster_health_status",
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- RBAC Authorization (migration 0003)
DO $$ BEGIN
 CREATE TYPE "public"."subject_type" AS ENUM('user', 'team', 'role');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."relation" AS ENUM('owner', 'admin', 'editor', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."object_type" AS ENUM('cluster', 'deployment', 'namespace', 'alert');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."team_member_role" AS ENUM('admin', 'member');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"relation" "relation" NOT NULL,
	"object_type" "object_type" NOT NULL,
	"object_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "relations_subject_object_relation_unq" UNIQUE("subject_type","subject_id","relation","object_type","object_id")
);

CREATE TABLE IF NOT EXISTS "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_pk" PRIMARY KEY("team_id","user_id")
);

DO $$ BEGIN
 ALTER TABLE "relations" ADD CONSTRAINT "relations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "relations_subject_lookup_idx" ON "relations" USING btree ("subject_type","subject_id");
CREATE INDEX IF NOT EXISTS "relations_object_lookup_idx" ON "relations" USING btree ("object_type","object_id");
CREATE INDEX IF NOT EXISTS "relations_relation_lookup_idx" ON "relations" USING btree ("subject_type","subject_id","object_type","object_id","relation");
CREATE INDEX IF NOT EXISTS "team_members_user_lookup_idx" ON "team_members" USING btree ("user_id");

-- Grant admin users owner permissions on all clusters
INSERT INTO "relations" ("subject_type", "subject_id", "relation", "object_type", "object_id", "created_by")
SELECT 'user'::"subject_type", u."id", 'owner'::"relation", 'cluster'::"object_type", c."id"::text, u."id"
FROM "user" u
CROSS JOIN "clusters" c
WHERE u."role" = 'admin'
ON CONFLICT ("subject_type","subject_id","relation","object_type","object_id") DO NOTHING;

-- Anomalies (migration 0008)
DO $$ BEGIN
 CREATE TYPE "public"."anomaly_severity" AS ENUM('critical', 'warning', 'info');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "anomalies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL,
  "type" varchar(64) NOT NULL,
  "severity" "anomaly_severity" NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" varchar(2000) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "resolved_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "anomaly_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL,
  "metric" varchar(64) NOT NULL,
  "operator" varchar(16) DEFAULT 'gt' NOT NULL,
  "threshold" varchar(64) NOT NULL,
  "severity" "anomaly_severity" DEFAULT 'warning' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_cluster_id_clusters_id_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "anomaly_rules" ADD CONSTRAINT "anomaly_rules_cluster_id_clusters_id_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_anomalies_cluster" ON "anomalies" ("cluster_id", "detected_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_anomaly_rules_cluster" ON "anomaly_rules" ("cluster_id");

-- Audit log (missing table — added v190)
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "user_email" text,
  "action" varchar(100) NOT NULL,
  "resource" varchar(100) NOT NULL,
  "resource_id" text,
  "details" text,
  "ip_address" varchar(45),
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

-- Metrics history (missing table — added v190)
CREATE TABLE IF NOT EXISTS "metrics_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "cpu_percent" real NOT NULL,
  "mem_percent" real NOT NULL,
  "pod_count" integer DEFAULT 0 NOT NULL,
  "node_count" integer DEFAULT 0 NOT NULL,
  "network_bytes_in" bigint DEFAULT 0,
  "network_bytes_out" bigint DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "idx_metrics_history_cluster_ts" ON "metrics_history" ("cluster_id", "timestamp");
-- M-P3-002: Add network columns to existing deployments (idempotent)
ALTER TABLE "metrics_history" ADD COLUMN IF NOT EXISTS "network_bytes_in" bigint DEFAULT 0;
ALTER TABLE "metrics_history" ADD COLUMN IF NOT EXISTS "network_bytes_out" bigint DEFAULT 0;

-- Feature flags (missing table — added v190)
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL UNIQUE,
  "description" text,
  "enabled" boolean DEFAULT false NOT NULL,
  "targeting" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Dashboard layouts (missing table — added v190)
CREATE TABLE IF NOT EXISTS "dashboard_layouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  "layout" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Shared dashboards (missing table — added v190)
DO $$ BEGIN
  CREATE TYPE "public"."dashboard_visibility" AS ENUM('private', 'team', 'public');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."dashboard_collaborator_role" AS ENUM('viewer', 'editor', 'owner');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "shared_dashboards" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "team_id" text DEFAULT 'org:default' NOT NULL,
  "config" jsonb NOT NULL,
  "visibility" "dashboard_visibility" DEFAULT 'private' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dashboard_collaborators" (
  "dashboard_id" text NOT NULL REFERENCES "shared_dashboards"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" "dashboard_collaborator_role" DEFAULT 'viewer' NOT NULL,
  PRIMARY KEY ("dashboard_id", "user_id")
);

-- User API tokens (missing table — added v190)
CREATE TABLE IF NOT EXISTS "user_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone
);

-- Webhooks (missing table — added v190)
CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "url" varchar(1000) NOT NULL,
  "secret" varchar(255),
  "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_triggered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "webhook_id" uuid NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
  "event" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL,
  "response_status" varchar(10),
  "success" boolean NOT NULL,
  "delivered_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- AI tables (missing — added v190)
DO $$ BEGIN
  CREATE TYPE "public"."ai_recommendation_severity" AS ENUM('critical', 'warning', 'info');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ai_recommendation_status" AS ENUM('open', 'dismissed', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."user_ai_key_provider" AS ENUM('openai', 'claude');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "messages" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" varchar(255),
  "provider" "ai_provider" NOT NULL,
  "model" varchar(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ai_threads_user_created" ON "ai_threads" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_ai_threads_cluster_created" ON "ai_threads" ("cluster_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "ai_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "ai_threads"("id") ON DELETE CASCADE,
  "role" varchar(16) NOT NULL,
  "content" text NOT NULL,
  "provider" "ai_provider" NOT NULL,
  "model" varchar(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ai_messages_thread_created" ON "ai_messages" ("thread_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "ai_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
  "severity" "ai_recommendation_severity" NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "action" text NOT NULL,
  "status" "ai_recommendation_status" DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Karpenter cache (missing — added v190)
CREATE TABLE IF NOT EXISTS "karpenter_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
  "data_type" varchar(50) NOT NULL,
  "payload" jsonb NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "karpenter_cache_cluster_data_type_uq" UNIQUE("cluster_id", "data_type")
);
CREATE INDEX IF NOT EXISTS "karpenter_cache_cluster_type_observed_idx" ON "karpenter_cache" ("cluster_id", "data_type", "observed_at");

-- user_ai_keys: update provider type if needed (v190 uses enum)
-- Note: user_ai_keys table already created above with text provider; 
-- ensure enum version is consistent

-- Per-node metrics history (Phase 5 MX-002)
CREATE TABLE IF NOT EXISTS "node_metrics_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
  "node_name" text NOT NULL,
  "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "cpu_percent" real NOT NULL,
  "mem_percent" real NOT NULL,
  "cpu_millis" integer NOT NULL DEFAULT 0,
  "mem_mi" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "idx_node_metrics_cluster_ts" ON "node_metrics_history" ("cluster_id", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_node_metrics_node" ON "node_metrics_history" ("cluster_id", "node_name", "timestamp");

-- Missing indexes on high-query tables (CLEAN-02)
CREATE INDEX IF NOT EXISTS "idx_events_cluster_ts" ON "events" ("cluster_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_events_kind" ON "events" ("cluster_id", "kind", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_nodes_cluster" ON "nodes" ("cluster_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_user_ts" ON "audit_log" ("user_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_log_ts" ON "audit_log" ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_log_action" ON "audit_log" ("action", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_alert_history_alert_ts" ON "alert_history" ("alert_id", "triggered_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_health_history_cluster_ts" ON "health_history" ("cluster_id", "checked_at" DESC);
