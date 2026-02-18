CREATE TABLE IF NOT EXISTS "user_ai_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "provider" "ai_provider" NOT NULL,
  "encrypted_key" text NOT NULL CHECK (length(trim("encrypted_key")) > 0),
  "model" varchar(120) NOT NULL CHECK (length(trim("model")) > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_ai_keys_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_user_ai_keys_user_provider"
  ON "user_ai_keys" ("user_id", "provider");

CREATE INDEX IF NOT EXISTS "idx_user_ai_keys_user_updated"
  ON "user_ai_keys" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_ai_keys_provider_updated"
  ON "user_ai_keys" ("provider", "updated_at" DESC);
