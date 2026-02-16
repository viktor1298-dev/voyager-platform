export const up = `
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

ALTER TABLE "anomalies"
  ADD CONSTRAINT "anomalies_cluster_id_clusters_id_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade;

ALTER TABLE "anomaly_rules"
  ADD CONSTRAINT "anomaly_rules_cluster_id_clusters_id_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "idx_anomalies_cluster" ON "anomalies" ("cluster_id", "detected_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_anomaly_rules_cluster" ON "anomaly_rules" ("cluster_id");
`

export const down = `
DROP TABLE IF EXISTS "anomaly_rules";
DROP TABLE IF EXISTS "anomalies";
DROP TYPE IF EXISTS "public"."anomaly_severity";
`
