-- Comptes utilisateurs : inscription (sans vérification d'email), prénom et nom séparés, nom
-- d'utilisateur, invitations par nom d'utilisateur et par lien, limitation des tentatives de connexion.
--
-- Un seul bloc DO : Postgres l'exécute d'un seul tenant (tout ou rien), y compris sur Neon, dont le
-- migrateur n'ouvre pas de transaction. Rejouable : sans effet si la migration est déjà appliquée
-- (colonne users.username présente).
--
-- Aucune ligne n'est supprimée ni insérée dans users (ni ailleurs). Les comptes existants gardent
-- leur id, leur email et leur mot de passe ; ils reçoivent :
--   - un nom d'utilisateur proposé (tiré du nom, sinon de l'email ; suffixe -2, -3… en cas de
--     collision), à confirmer ou modifier à la prochaine connexion (username_confirmed_at nul) ;
--   - un prénom et un nom (first_name, last_name), découpés sur le premier espace de leur nom actuel
--     (un seul mot : prénom seul, nom vide).
-- users.name devient une colonne calculée par Postgres (« Prénom Nom ») : le reste de l'application
-- la lit sans changement. Avant de remplacer l'ancienne colonne, la migration vérifie que le nom
-- recalculé est identique au nom actuel pour chaque compte (sinon elle s'arrête en les listant).
-- Seule contrainte relâchée : project_invitations.email devient nullable (invitation par nom
-- d'utilisateur), l'un des deux restant obligatoire.
--
-- Garde-fous : refuse de s'appliquer si la migration 0012 (isolation des projets) manque, si
-- deux comptes ont le même email à la casse près (ils sont listés ; à régler avant de relancer), si
-- un nom ne se découpe pas sans perte (espace en tête, en fin ou doublé : listés), ou
-- si une version de développement antérieure de cette migration (avec vérification d'email) est
-- déjà en place : lancer alors npm run db:comptes-rollback -- --confirm, puis npm run db:migrate.
--
-- Aperçu avant application : npm run db:comptes-preview
-- Retour arrière : scripts/rollback/0013_comptes_utilisateurs.sql
DO $migration$
DECLARE
  -- Noms réservés : même liste que RESERVED_USERNAMES (src/lib/usernames.ts).
  reserved text[] := ARRAY[
    'admin', 'administrateur', 'administrator', 'api', 'www', 'support', 'root', 'system', 'systeme',
    'gepro', 'help', 'aide', 'contact', 'info', 'mail', 'email', 'noreply', 'no-reply', 'security',
    'securite', 'staff', 'team', 'equipe', 'owner', 'proprietaire', 'moderateur', 'moderator',
    'null', 'undefined', 'anonymous', 'anonyme', 'me', 'moi', 'login', 'logout', 'connexion',
    'deconnexion', 'inscription', 'invitations', 'membres', 'projets', 'parametres', 'settings'
  ];
  duplicates text;
  mismatches text;
  u record;
  base text;
  candidate text;
  n integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_verified_at'
  ) THEN
    RAISE EXCEPTION '0013_comptes_utilisateurs : une ancienne version (avec vérification d''email) est appliquée. Lancez npm run db:comptes-rollback -- --confirm, puis npm run db:migrate.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    RAISE NOTICE '0013_comptes_utilisateurs : déjà appliquée.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    RAISE EXCEPTION '0013_comptes_utilisateurs : la migration 0012_isolation_projets doit être appliquée avant.';
  END IF;

  SELECT string_agg(emails, ' ; ') INTO duplicates FROM (
    SELECT string_agg("email", ', ' ORDER BY "email") AS emails
    FROM "users" GROUP BY lower("email") HAVING count(*) > 1
  ) d;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION '0013_comptes_utilisateurs : emails en double à la casse près, à régler avant de migrer : %', duplicates;
  END IF;

  -- Nouvelles tables.
  CREATE TABLE "auth_throttle" (
    "key" text PRIMARY KEY NOT NULL,
    "failures" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "project_invite_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "token_hash" text NOT NULL,
    "role" "project_role" DEFAULT 'member' NOT NULL,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_invite_links_token_hash_unique" UNIQUE("token_hash"),
    CONSTRAINT "project_invite_links_member_only" CHECK ("project_invite_links"."role" = 'member'),
    CONSTRAINT "project_invite_links_uses" CHECK ("project_invite_links"."max_uses" is null or ("project_invite_links"."max_uses" >= 1 and "project_invite_links"."use_count" <= "project_invite_links"."max_uses"))
  );
  CREATE TABLE "project_invite_link_uses" (
    "link_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "used_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_invite_link_uses_link_id_user_id_pk" PRIMARY KEY("link_id","user_id")
  );
  ALTER TABLE "project_invite_links" ADD CONSTRAINT "project_invite_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "project_invite_links" ADD CONSTRAINT "project_invite_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "project_invite_link_uses" ADD CONSTRAINT "project_invite_link_uses_link_id_project_invite_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."project_invite_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "project_invite_link_uses" ADD CONSTRAINT "project_invite_link_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "project_invite_links_project_idx" ON "project_invite_links" USING btree ("project_id");
  CREATE INDEX "project_invite_link_uses_user_idx" ON "project_invite_link_uses" USING btree ("user_id");

  -- Invitations : par email (existant) ou par compte (nom d'utilisateur), l'un ou l'autre.
  ALTER TABLE "project_invitations" ADD COLUMN "invited_user_id" uuid;
  ALTER TABLE "project_invitations" ALTER COLUMN "email" DROP NOT NULL;
  ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_one_target" CHECK (("project_invitations"."email" is null) <> ("project_invitations"."invited_user_id" is null));
  CREATE INDEX "project_invitations_invited_user_idx" ON "project_invitations" USING btree ("invited_user_id");
  CREATE UNIQUE INDEX "project_invitations_pending_user_uq" ON "project_invitations" USING btree ("project_id","invited_user_id") WHERE "project_invitations"."status" = 'pending';

  -- Comptes : colonnes nullables.
  ALTER TABLE "users" ADD COLUMN "username" text;
  ALTER TABLE "users" ADD COLUMN "username_confirmed_at" timestamp with time zone;

  -- Nom d'utilisateur proposé à chaque compte existant, du plus ancien au plus récent.
  FOR u IN SELECT "id", "name", "email" FROM "users" ORDER BY "created_at", "id" LOOP
    base := NULL;
    FOREACH candidate IN ARRAY ARRAY[u."name", split_part(u."email", '@', 1)] LOOP
      candidate := replace(replace(lower(coalesce(candidate, '')), 'æ', 'ae'), 'œ', 'oe');
      candidate := translate(candidate, 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
      candidate := left(btrim(regexp_replace(candidate, '[^a-z0-9]+', '-', 'g'), '-'), 30);
      candidate := btrim(candidate, '-');
      IF length(candidate) >= 3 THEN
        base := candidate;
        EXIT;
      END IF;
    END LOOP;
    base := coalesce(base, 'membre');

    candidate := base;
    n := 1;
    WHILE candidate = ANY(reserved) OR EXISTS (SELECT 1 FROM "users" WHERE lower("username") = lower(candidate)) LOOP
      n := n + 1;
      candidate := btrim(left(base, 29 - length(n::text)), '-') || '-' || n;
    END LOOP;

    UPDATE "users" SET "username" = candidate WHERE "id" = u."id";
  END LOOP;

  -- Prénom et nom, découpés sur le premier espace du nom actuel.
  ALTER TABLE "users" ADD COLUMN "first_name" text;
  ALTER TABLE "users" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;
  UPDATE "users" SET
    "first_name" = split_part("name", ' ', 1),
    "last_name" = CASE WHEN position(' ' IN "name") > 0 THEN substr("name", position(' ' IN "name") + 1) ELSE '' END;
  SELECT string_agg(format('%s (%L)', "email", "name"), ' ; ' ORDER BY "email") INTO mismatches
  FROM "users"
  WHERE "first_name" = ''
     OR "last_name" <> btrim("last_name")
     OR "first_name" || CASE WHEN "last_name" = '' THEN '' ELSE ' ' || "last_name" END <> "name";
  IF mismatches IS NOT NULL THEN
    RAISE EXCEPTION '0013_comptes_utilisateurs : noms impossibles à découper en prénom et nom sans perte (espace en tête, en fin ou doublé), à corriger avant de migrer : %', mismatches;
  END IF;
  ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;

  -- users.name : calculé à partir du prénom et du nom (même valeur, vérifiée ci-dessus).
  ALTER TABLE "users" DROP COLUMN "name";
  ALTER TABLE "users" ADD COLUMN "name" text GENERATED ALWAYS AS ("first_name" || case when "last_name" = '' then '' else ' ' || "last_name" end) STORED NOT NULL;

  ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[A-Za-z0-9_-]{3,30}$');
  CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));
  CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));
END
$migration$;
