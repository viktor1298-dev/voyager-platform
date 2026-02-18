DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_ai_keys'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_user_ai_keys_encrypted_key_not_blank'
    ) THEN
      ALTER TABLE "user_ai_keys"
      ADD CONSTRAINT "chk_user_ai_keys_encrypted_key_not_blank"
      CHECK (length(trim("encrypted_key")) > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_user_ai_keys_model_not_blank'
    ) THEN
      ALTER TABLE "user_ai_keys"
      ADD CONSTRAINT "chk_user_ai_keys_model_not_blank"
      CHECK (length(trim("model")) > 0);
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.user_ai_keys') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "uidx_user_ai_keys_user_provider"
      ON "user_ai_keys" ("user_id", "provider");

    CREATE INDEX IF NOT EXISTS "idx_user_ai_keys_user_updated"
      ON "user_ai_keys" ("user_id", "updated_at" DESC);

    CREATE INDEX IF NOT EXISTS "idx_user_ai_keys_provider_updated"
      ON "user_ai_keys" ("provider", "updated_at" DESC);
  END IF;
END
$$;
