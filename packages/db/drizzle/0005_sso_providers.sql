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
