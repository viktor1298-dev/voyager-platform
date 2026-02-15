CREATE TABLE IF NOT EXISTS "karpenter_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL,
  "data_type" varchar(50) NOT NULL,
  "payload" jsonb NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "karpenter_cache" ADD CONSTRAINT "karpenter_cache_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "karpenter_cache_cluster_type_observed_idx" ON "karpenter_cache" USING btree ("cluster_id","data_type","observed_at");
