CREATE TABLE IF NOT EXISTS "metrics_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"cpu_percent" real NOT NULL,
	"mem_percent" real NOT NULL,
	"pod_count" integer DEFAULT 0 NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metrics_history" ADD CONSTRAINT "metrics_history_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX idx_metrics_history_cluster_ts ON metrics_history(cluster_id, timestamp);
