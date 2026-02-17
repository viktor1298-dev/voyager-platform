CREATE TYPE "public"."dashboard_visibility" AS ENUM('private', 'team', 'public');
CREATE TYPE "public"."dashboard_collaborator_role" AS ENUM('viewer', 'editor', 'owner');

CREATE TABLE "shared_dashboards" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_by" text NOT NULL,
  "config" jsonb NOT NULL,
  "visibility" "dashboard_visibility" DEFAULT 'private' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "dashboard_collaborators" (
  "dashboard_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" "dashboard_collaborator_role" DEFAULT 'viewer' NOT NULL,
  CONSTRAINT "dashboard_collaborators_dashboard_id_user_id_pk" PRIMARY KEY("dashboard_id","user_id")
);

ALTER TABLE "shared_dashboards"
  ADD CONSTRAINT "shared_dashboards_created_by_user_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "dashboard_collaborators"
  ADD CONSTRAINT "dashboard_collaborators_dashboard_id_shared_dashboards_id_fk"
  FOREIGN KEY ("dashboard_id") REFERENCES "public"."shared_dashboards"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "dashboard_collaborators"
  ADD CONSTRAINT "dashboard_collaborators_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
