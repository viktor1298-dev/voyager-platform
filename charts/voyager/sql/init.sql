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
