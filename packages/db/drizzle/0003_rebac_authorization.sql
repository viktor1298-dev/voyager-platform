DO $$ BEGIN
 CREATE TYPE "public"."subject_type" AS ENUM('user', 'team', 'role');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."relation" AS ENUM('owner', 'admin', 'editor', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."object_type" AS ENUM('cluster', 'deployment', 'namespace', 'alert');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."team_member_role" AS ENUM('admin', 'member');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"relation" "relation" NOT NULL,
	"object_type" "object_type" NOT NULL,
	"object_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "relations_subject_object_relation_unq" UNIQUE("subject_type","subject_id","relation","object_type","object_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "relations" ADD CONSTRAINT "relations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "relations_subject_lookup_idx" ON "relations" USING btree ("subject_type","subject_id");
CREATE INDEX IF NOT EXISTS "relations_object_lookup_idx" ON "relations" USING btree ("object_type","object_id");
CREATE INDEX IF NOT EXISTS "relations_relation_lookup_idx" ON "relations" USING btree ("subject_type","subject_id","object_type","object_id","relation");
CREATE INDEX IF NOT EXISTS "team_members_user_lookup_idx" ON "team_members" USING btree ("user_id");
--> statement-breakpoint

INSERT INTO "relations" ("subject_type", "subject_id", "relation", "object_type", "object_id", "created_by")
SELECT 'user'::"subject_type", u."id", 'owner'::"relation", 'cluster'::"object_type", c."id"::text, u."id"
FROM "user" u
CROSS JOIN "clusters" c
WHERE u."role" = 'admin'
ON CONFLICT ("subject_type","subject_id","relation","object_type","object_id") DO NOTHING;
