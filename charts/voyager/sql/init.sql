CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE TABLE IF NOT EXISTS clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'unreachable',
  version VARCHAR(50),
  nodes_count INTEGER NOT NULL DEFAULT 0,
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

-- Multi-provider clusters (migration 0002)
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

ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "environment" "cluster_environment" DEFAULT 'development' NOT NULL;
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "connection_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "health_status" "cluster_health_status" DEFAULT 'unknown' NOT NULL;
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "last_health_check" timestamp with time zone;
ALTER TABLE "clusters" ALTER COLUMN "endpoint" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clusters' 
    AND column_name = 'provider' 
    AND data_type = 'character varying'
  ) THEN
    ALTER TABLE "clusters" ALTER COLUMN "provider" TYPE "cluster_provider" USING (
      CASE
        WHEN "provider" IN ('minikube') THEN 'minikube'::"cluster_provider"
        WHEN "provider" IN ('eks', 'aws') THEN 'aws'::"cluster_provider"
        WHEN "provider" IN ('aks', 'azure') THEN 'azure'::"cluster_provider"
        WHEN "provider" IN ('gcp', 'gke') THEN 'gke'::"cluster_provider"
        ELSE 'kubeconfig'::"cluster_provider"
      END
    );
    ALTER TABLE "clusters" ALTER COLUMN "provider" SET DEFAULT 'kubeconfig';
  END IF;
END $$;

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
  'production'::"cluster_environment",
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

-- Seed test cluster for E2E tests
INSERT INTO "clusters" (id, name, provider, environment, endpoint, connection_config, status, health_status, nodes_count, created_at, updated_at)
VALUES (
  'e2e-test-cluster-001'::uuid,
  'minikube-test',
  'minikube'::"cluster_provider",
  'development'::"cluster_environment",
  'https://192.168.49.2:8443',
  '{}'::jsonb,
  'healthy',
  'healthy'::"cluster_health_status",
  1,
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Grant admin users owner permissions on all clusters
INSERT INTO "relations" ("subject_type", "subject_id", "relation", "object_type", "object_id", "created_by")
SELECT 'user'::"subject_type", u."id", 'owner'::"relation", 'cluster'::"object_type", c."id"::text, u."id"
FROM "user" u
CROSS JOIN "clusters" c
WHERE u."role" = 'admin'
ON CONFLICT ("subject_type","subject_id","relation","object_type","object_id") DO NOTHING;
