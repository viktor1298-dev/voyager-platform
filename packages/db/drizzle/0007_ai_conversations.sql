CREATE TYPE "ai_recommendation_severity" AS ENUM('critical', 'warning', 'info');
CREATE TYPE "ai_recommendation_status" AS ENUM('open', 'dismissed', 'resolved');

CREATE TABLE "ai_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "messages" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL,
  "severity" "ai_recommendation_severity" NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "action" text NOT NULL,
  "status" "ai_recommendation_status" DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_ai_conversations_cluster" ON "ai_conversations" ("cluster_id");
CREATE INDEX "idx_ai_conversations_user" ON "ai_conversations" ("user_id");
CREATE INDEX "idx_ai_recommendations_cluster" ON "ai_recommendations" ("cluster_id");
