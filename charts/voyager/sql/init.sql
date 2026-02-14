CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
