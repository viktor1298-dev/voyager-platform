CREATE TYPE "public"."user_ai_key_provider" AS ENUM('openai', 'claude');

CREATE TABLE "user_ai_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "provider" "user_ai_key_provider" NOT NULL,
  "encrypted_key" text NOT NULL,
  "model" varchar(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "user_ai_keys"
  ADD CONSTRAINT "user_ai_keys_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "idx_user_ai_keys_user_provider" ON "user_ai_keys" USING btree ("user_id", "provider");
CREATE INDEX "idx_user_ai_keys_user" ON "user_ai_keys" USING btree ("user_id");
