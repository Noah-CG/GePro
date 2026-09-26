-- Retour arrière de drizzle/0011_isolation_projets.sql (npm run db:isolation-rollback).
--
-- À n'utiliser qu'avec le code d'avant l'isolation (sinon l'application ne démarre plus : elle
-- lit project_members). Un seul bloc : tout ou rien. Sans effet si la migration n'est pas appliquée.
--
-- Ce qui est perdu : membres, invitations et propriétaires des projets (ils n'existaient pas avant).
-- Les événements d'équipe redeviennent sans projet ; leurs copies créées par la migration sont
-- retirées (une modification faite depuis sur une copie est donc perdue). Les événements créés
-- après la migration restent rattachés à leur projet.
DO $rollback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    RAISE NOTICE '0011_isolation_projets : pas appliquée, rien à défaire.';
    RETURN;
  END IF;

  ALTER TABLE "project_events" ALTER COLUMN "project_id" DROP NOT NULL;
  IF to_regclass('public.migration_0011_team_events') IS NOT NULL THEN
    DELETE FROM "project_events" e USING "migration_0011_team_events" m
    WHERE m."event_id" = e."id" AND m."event_id" <> m."source_event_id";
    UPDATE "project_events" e SET "project_id" = NULL FROM "migration_0011_team_events" m
    WHERE m."event_id" = e."id" AND m."event_id" = m."source_event_id";
    DROP TABLE "migration_0011_team_events";
  END IF;

  DROP TABLE "project_invitations";
  DROP TABLE "project_members";
  ALTER TABLE "projects" DROP COLUMN "owner_id";
  DROP INDEX IF EXISTS "work_sessions_project_idx";
  DROP TYPE "invitation_status";
  DROP TYPE "project_role";

  -- Oublie la migration : `npm run db:migrate` la rejouerait.
  DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1790442381794;
END
$rollback$;
