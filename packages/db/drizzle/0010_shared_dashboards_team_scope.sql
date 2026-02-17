ALTER TABLE "shared_dashboards"
  ADD COLUMN "team_id" text NOT NULL DEFAULT 'org:default';

CREATE INDEX "shared_dashboards_team_visibility_idx"
  ON "shared_dashboards" ("team_id", "visibility", "updated_at");
