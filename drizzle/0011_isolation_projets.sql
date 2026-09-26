-- Isolation des projets : membres, invitations, propriétaire, et tout événement rattaché à un projet.
--
-- Un seul bloc DO : Postgres l'exécute d'un seul tenant (tout ou rien), y compris sur Neon, dont le
-- migrateur n'ouvre pas de transaction. Rejouable : sans effet si la migration est déjà appliquée
-- (colonne projects.owner_id présente). Aucune ligne n'est supprimée.
--
-- Données existantes :
-- 1. Propriétaire de chaque projet : son créateur, sinon le plus ancien administrateur, sinon le
--    plus ancien compte.
-- 2. Membres : le propriétaire ("owner"), puis toute personne ayant contribué au projet ("member") :
--    responsable ou auteur d'une tâche, auteur d'un événement, d'une journée importante, d'un
--    fichier, d'un document ou du salon Discord, temps de travail pointé, synchronisation Agenda.
-- 3. Événements d'équipe (sans projet) : l'original est rattaché au plus ancien projet, et une copie
--    est créée dans chacun des autres projets (ils y étaient tous affichés). La correspondance est
--    gardée dans migration_0011_team_events pour le retour arrière.
--
-- Aperçu avant application : npm run db:isolation-preview
-- Retour arrière : scripts/rollback/0011_isolation_projets.sql
DO $migration$
DECLARE
  first_project uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    RAISE NOTICE '0011_isolation_projets : déjà appliquée.';
    RETURN;
  END IF;

  CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked');
  CREATE TYPE "public"."project_role" AS ENUM('owner', 'admin', 'member');

  CREATE TABLE "project_invitations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "email" text NOT NULL,
    "role" "project_role" DEFAULT 'member' NOT NULL,
    "token_hash" text NOT NULL,
    "status" "invitation_status" DEFAULT 'pending' NOT NULL,
    "invited_by" uuid,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "project_invitations_token_hash_unique" UNIQUE("token_hash"),
    CONSTRAINT "project_invitations_not_owner" CHECK ("project_invitations"."role" <> 'owner')
  );
  CREATE TABLE "project_members" (
    "project_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" "project_role" DEFAULT 'member' NOT NULL,
    "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
  );
  ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "project_invitations_project_idx" ON "project_invitations" USING btree ("project_id");
  CREATE INDEX "project_invitations_email_idx" ON "project_invitations" USING btree ("email");
  CREATE UNIQUE INDEX "project_invitations_pending_uq" ON "project_invitations" USING btree ("project_id","email") WHERE "project_invitations"."status" = 'pending';
  CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");
  CREATE UNIQUE INDEX "project_members_one_owner_uq" ON "project_members" USING btree ("project_id") WHERE "project_members"."role" = 'owner';
  CREATE INDEX "work_sessions_project_idx" ON "work_sessions" USING btree ("project_id");

  -- 1. Propriétaire de chaque projet.
  ALTER TABLE "projects" ADD COLUMN "owner_id" uuid;
  UPDATE "projects" SET "owner_id" = COALESCE(
    "created_by",
    (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at", "id" LIMIT 1),
    (SELECT "id" FROM "users" ORDER BY "created_at", "id" LIMIT 1)
  );
  IF EXISTS (SELECT 1 FROM "projects" WHERE "owner_id" IS NULL) THEN
    RAISE EXCEPTION 'Des projets existent mais aucun compte : impossible de leur donner un propriétaire.';
  END IF;
  ALTER TABLE "projects" ALTER COLUMN "owner_id" SET NOT NULL;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

  -- 2. Membres : le propriétaire, puis les contributeurs.
  INSERT INTO "project_members" ("project_id", "user_id", "role")
  SELECT "id", "owner_id", 'owner' FROM "projects";

  INSERT INTO "project_members" ("project_id", "user_id", "role")
  SELECT DISTINCT c.project_id, c.user_id, 'member'::"project_role"
  FROM (
    SELECT t."project_id", a."user_id" FROM "task_assignees" a JOIN "tasks" t ON t."id" = a."task_id"
    UNION SELECT "project_id", "created_by" FROM "tasks"
    UNION SELECT "project_id", "created_by" FROM "project_events"
    UNION SELECT "project_id", "created_by" FROM "important_days"
    UNION SELECT "project_id", "uploaded_by" FROM "project_files"
    UNION SELECT "project_id", "attached_by" FROM "external_resources"
    UNION SELECT "project_id", "user_id" FROM "work_sessions"
    UNION SELECT "project_id", "linked_by" FROM "project_discord"
    UNION SELECT "project_id", "user_id" FROM "google_calendar_sync_projects"
  ) c
  WHERE c.project_id IS NOT NULL AND c.user_id IS NOT NULL
  ON CONFLICT ("project_id", "user_id") DO NOTHING;

  -- 3. Événements d'équipe : l'original au plus ancien projet, une copie dans chacun des autres.
  CREATE TABLE "migration_0011_team_events" (
    "event_id" uuid PRIMARY KEY NOT NULL,
    "source_event_id" uuid NOT NULL,
    "project_id" uuid NOT NULL
  );
  IF EXISTS (SELECT 1 FROM "project_events" WHERE "project_id" IS NULL) THEN
    SELECT "id" INTO first_project FROM "projects" ORDER BY "created_at", "id" LIMIT 1;
    IF first_project IS NULL THEN
      RAISE EXCEPTION 'Des événements d''équipe existent mais aucun projet : créez un projet avant de migrer.';
    END IF;

    INSERT INTO "migration_0011_team_events" ("event_id", "source_event_id", "project_id")
    SELECT gen_random_uuid(), e."id", p."id"
    FROM "project_events" e CROSS JOIN "projects" p
    WHERE e."project_id" IS NULL AND p."id" <> first_project;

    INSERT INTO "project_events" ("id", "project_id", "title", "description", "event_date", "color", "created_by", "created_at", "updated_at")
    SELECT m."event_id", m."project_id", e."title", e."description", e."event_date", e."color", e."created_by", e."created_at", e."updated_at"
    FROM "migration_0011_team_events" m JOIN "project_events" e ON e."id" = m."source_event_id";

    INSERT INTO "migration_0011_team_events" ("event_id", "source_event_id", "project_id")
    SELECT "id", "id", first_project FROM "project_events" WHERE "project_id" IS NULL;

    UPDATE "project_events" SET "project_id" = first_project WHERE "project_id" IS NULL;
  END IF;
  ALTER TABLE "project_events" ALTER COLUMN "project_id" SET NOT NULL;
END
$migration$;
