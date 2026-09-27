-- Retour arrière de drizzle/0013_comptes_utilisateurs.sql (npm run db:comptes-rollback).
--
-- À n'utiliser qu'avec le code d'avant les comptes utilisateurs (sinon l'application ne démarre
-- plus : elle lit users.first_name). Un seul bloc : tout ou rien. Sans effet si la migration n'est
-- pas appliquée. Défait aussi les anciennes versions de développement de la migration (avec
-- vérification d'email : tables de jetons et users.email_verified_at ; avec noms d'utilisateur :
-- users.username, users.username_confirmed_at et invitations par nom d'utilisateur).
--
-- Aucun compte n'est supprimé (aucun DELETE sur users). users.name redevient une colonne
-- ordinaire, avec la même valeur (« Prénom Nom »). Ce qui est perdu :
--   - la séparation prénom / nom (et les noms d'utilisateur d'une ancienne version) ;
--   - liens d'invitation et leur journal (les membres entrés par un lien restent membres) ;
--   - compteurs de tentatives de connexion ;
--   - ancienne version seulement : invitations par nom d'utilisateur (sans email, elles ne peuvent
--     pas redevenir des invitations par email : elles sont retirées ; les membres qui les ont
--     acceptées restent).
-- Les comptes créés par inscription restent des comptes ordinaires (email + mot de passe).
DO $rollback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('first_name', 'username')
  ) THEN
    RAISE NOTICE '0013_comptes_utilisateurs : pas appliquée, rien à défaire.';
    RETURN;
  END IF;

  DROP TABLE "project_invite_link_uses";
  DROP TABLE "project_invite_links";
  DROP TABLE "auth_throttle";
  -- Ancienne version de développement (vérification d'email) seulement.
  DROP TABLE IF EXISTS "password_reset_tokens";
  DROP TABLE IF EXISTS "email_verification_tokens";

  -- Ancienne version de développement (noms d'utilisateur) seulement.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_invitations' AND column_name = 'invited_user_id'
  ) THEN
    DELETE FROM "project_invitations" WHERE "email" IS NULL;
    ALTER TABLE "project_invitations" DROP CONSTRAINT "project_invitations_one_target";
    DROP INDEX "project_invitations_pending_user_uq";
    DROP INDEX "project_invitations_invited_user_idx";
    ALTER TABLE "project_invitations" DROP COLUMN "invited_user_id";
    ALTER TABLE "project_invitations" ALTER COLUMN "email" SET NOT NULL;
  END IF;

  -- users.name : colonne ordinaire, même valeur que la colonne calculée.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "name" TO "name_calcule";
    ALTER TABLE "users" ADD COLUMN "name" text;
    UPDATE "users" SET "name" = "name_calcule";
    ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
    ALTER TABLE "users" DROP COLUMN "name_calcule";
    ALTER TABLE "users" DROP COLUMN "first_name";
    ALTER TABLE "users" DROP COLUMN "last_name";
  END IF;

  DROP INDEX "users_email_lower_uq";
  DROP INDEX IF EXISTS "users_username_lower_uq";
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_format";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "username_confirmed_at";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "username";

  -- Oublie la migration (version actuelle et anciennes versions) : `npm run db:migrate` la rejouerait.
  DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" IN (1790509505463, 1790501594117, 1790455614209);
END
$rollback$;
