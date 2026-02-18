export const up = `
DO $$ BEGIN
 CREATE TYPE ai_provider AS ENUM ('openai', 'anthropic');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS ai_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title VARCHAR(255),
  provider ai_provider NOT NULL,
  model VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  provider ai_provider NOT NULL,
  model VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_threads_user_created ON ai_threads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_threads_cluster_created ON ai_threads(cluster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created ON ai_messages(thread_id, created_at DESC);
`

export const down = `
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_threads;
DROP TYPE IF EXISTS ai_provider;
`
