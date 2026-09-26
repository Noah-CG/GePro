ALTER TABLE "tasks" ADD COLUMN "sibling_position" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Ordre initial parmi les tâches sœurs : ordre de création. Les tâches existantes gardent leur parente
-- (les tâches sans parente restent des tâches racines).
UPDATE "tasks" SET "sibling_position" = ranked.rn * 1024
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "project_id", "parent_id" ORDER BY "created_at", "id") AS rn
  FROM "tasks"
) AS ranked
WHERE ranked."id" = "tasks"."id";--> statement-breakpoint
CREATE INDEX "tasks_project_parent_sibling_idx" ON "tasks" USING btree ("project_id","parent_id","sibling_position");
