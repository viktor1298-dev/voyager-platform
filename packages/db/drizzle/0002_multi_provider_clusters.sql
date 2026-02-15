DO $$ BEGIN
 CREATE TYPE "public"."cluster_provider" AS ENUM('kubeconfig', 'aws-eks', 'azure-aks', 'gke', 'minikube');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cluster_environment" AS ENUM('production', 'staging', 'development');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cluster_health_status" AS ENUM('healthy', 'degraded', 'critical', 'unreachable', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "environment" "cluster_environment" DEFAULT 'development' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "connection_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "health_status" "cluster_health_status" DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "last_health_check" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "clusters" ALTER COLUMN "endpoint" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "clusters" ALTER COLUMN "provider" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "clusters" ALTER COLUMN "provider" TYPE "cluster_provider" USING (
  CASE
    WHEN "provider" IN ('minikube') THEN 'minikube'::"cluster_provider"
    WHEN "provider" IN ('eks', 'aws', 'aws-eks') THEN 'aws-eks'::"cluster_provider"
    WHEN "provider" IN ('aks', 'azure', 'azure-aks') THEN 'azure-aks'::"cluster_provider"
    WHEN "provider" IN ('gcp', 'gke') THEN 'gke'::"cluster_provider"
    ELSE 'kubeconfig'::"cluster_provider"
  END
);
--> statement-breakpoint
ALTER TABLE "clusters" ALTER COLUMN "provider" SET DEFAULT 'kubeconfig';
