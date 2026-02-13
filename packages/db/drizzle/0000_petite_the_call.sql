CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"endpoint" varchar(500) NOT NULL,
	"status" varchar(50) DEFAULT 'unreachable' NOT NULL,
	"version" varchar(50),
	"nodes_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clusters_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"namespace" varchar(255),
	"kind" varchar(50) NOT NULL,
	"reason" varchar(255),
	"message" text,
	"source" varchar(255),
	"involved_object" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_id_timestamp_pk" PRIMARY KEY("id","timestamp")
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'Unknown' NOT NULL,
	"role" varchar(50) DEFAULT 'worker' NOT NULL,
	"cpu_capacity" integer,
	"cpu_allocatable" integer,
	"memory_capacity" bigint,
	"memory_allocatable" bigint,
	"pods_count" integer DEFAULT 0 NOT NULL,
	"k8s_version" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;