-- Retour arrière de drizzle/0013_comptes_utilisateurs.sql (npm run db:comptes-rollback).
--
-- À n'utiliser qu'avec le code d'avant les comptes utilisateurs (sinon l'application ne démarre
-- plus : elle lit users.username). Un seul bloc : tout ou rien. Sans effet si la migration n'est pas
-- appliquée.
--
-- Aucun compte n'est supprimé (aucun DELETE sur users). Ce qui est perdu :
--   - noms d'utilisateur, vérifications d'email, jetons de vérification et de réinitialisation ;
--   - liens d'invitation et leur journal (les membres entrés par un lien restent membres) ;
--   - invitations par nom d'utilisateur (sans email, elles ne peuvent pas redevenir des
--     invitations par email : elles sont retirées ; les membres qui les ont acceptées restent) ;
--   - compteurs de tentatives de connexion.
-- Les comptes créés par inscription restent des comptes ordinaires (email + mot de passe).
DO $rollback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    RAISE NOTICE '0013_comptes_utilisateurs : pas appliquée, rien à défaire.';
    RETURN;
  END IF;

  DROP TABLE "project_invite_link_uses";
  DROP TABLE "project_invite_links";
  DROP TABLE "password_reset_tokens";
  DROP TABLE "email_verification_tokens";
  DROP TABLE "auth_throttle";

  DELETE FROM "project_invitations" WHERE "email" IS NULL;
  ALTER TABLE "project_invitations" DROP CONSTRAINT "project_invitations_one_target";
  DROP INDEX "project_invitations_pending_user_uq";
  DROP INDEX "project_invitations_invited_user_idx";
  ALTER TABLE "project_invitations" DROP COLUMN "invited_user_id";
  ALTER TABLE "project_invitations" ALTER COLUMN "email" SET NOT NULL;

  DROP INDEX "users_username_lower_uq";
  DROP INDEX "users_email_lower_uq";
  ALTER TABLE "users" DROP CONSTRAINT "users_username_format";
  ALTER TABLE "users" DROP COLUMN "email_verified_at";
  ALTER TABLE "users" DROP COLUMN "username_confirmed_at";
  ALTER TABLE "users" DROP COLUMN "username";

  -- Oublie la migration : `npm run db:migrate` la rejouerait.
  DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1790455614209;
END
$rollback$;
