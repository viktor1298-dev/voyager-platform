export const up = `
CREATE TYPE ai_recommendation_severity AS ENUM ('critical', 'warning', 'info');
CREATE TYPE ai_recommendation_status AS ENUM ('open', 'dismissed', 'resolved');

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  messages JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  severity ai_recommendation_severity NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  action TEXT NOT NULL,
  status ai_recommendation_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

export const down = `
DROP TABLE IF EXISTS ai_recommendations;
DROP TABLE IF EXISTS ai_conversations;
DROP TYPE IF EXISTS ai_recommendation_status;
DROP TYPE IF EXISTS ai_recommendation_severity;
`
