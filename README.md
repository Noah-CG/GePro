# GePro

Application de gestion de projet pour petites équipes (5 à 15 personnes) : projets, tâches, Kanban, liste filtrable, tableau de bord et recherche rapide.

**Stack** : Next.js 16 (App Router, Server Actions) · Neon Postgres · Drizzle ORM · Tailwind CSS 4 · dnd-kit · cmdk.

---

## Démarrage rapide (sans compte Neon)

Sans `DATABASE_URL`, l'app utilise une base Postgres embarquée (PGlite, dossier `.pglite/`). Pratique pour essayer l'app avant de créer la base Neon.

```bash
npm install
npm run db:setup      # crée les tables + charge les données de démo
npm run dev           # http://localhost:3000
```

Connexion : **camille@exemple.fr / demo1234** (administratrice). Les 5 autres membres de démo ont le même mot de passe.

> La base locale n'accepte qu'un seul processus à la fois : arrêtez `npm run dev` avant de lancer un script `db:*`.

## Brancher Neon (pas à pas)

1. Créez un compte gratuit sur [neon.tech](https://neon.tech), puis **New Project**. Choisissez la région la plus proche de vos utilisateurs (par ex. *AWS Europe Central (Frankfurt)*) et Postgres 17.
2. Dans le projet, cliquez sur **Connect**. Gardez la branche `main` et la base `neondb`, activez **Connection pooling**, puis copiez la chaîne de connexion (`postgresql://…-pooler…neon.tech/neondb?sslmode=require`).
3. À la racine du projet, créez `.env.local` à partir de `.env.example` :
   ```env
   DATABASE_URL=postgresql://utilisateur:motdepasse@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   APP_TIMEZONE=Europe/Paris
   ```
4. Créez les tables, puis au choix :
   ```bash
   npm run db:migrate
   npm run db:seed                  # option A : données de démo
   npm run user:create -- --name "Votre Nom" --email vous@societe.fr --password "motdepasse" --admin   # option B : base vide
   ```
5. Lancez `npm run dev`. Les comptes suivants se créent ensuite depuis l'app (**menu du compte → Gérer les membres**).

### Déploiement sur Vercel

Importez le dépôt dans Vercel. Ajoutez `DATABASE_URL` et `APP_TIMEZONE` dans *Settings → Environment Variables*, puis déployez. Les migrations se lancent depuis votre poste avec `npm run db:migrate`, `.env.local` pointant sur Neon.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement, build, production |
| `npm run lint` | Vérification TypeScript |
| `npm run db:generate` | Génère une migration SQL après modification de `src/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations (Neon ou base locale) |
| `npm run db:seed [-- --reset]` | Charge la démo (`--reset` efface d'abord **toutes** les données) |
| `npm run user:create -- …` | Crée un compte en ligne de commande |

## Raccourcis clavier

| Touche | Action |
|---|---|
| `N` | Nouvelle tâche (dans le projet courant si vous êtes sur une page projet) |
| `P` | Nouveau projet |
| `Ctrl/⌘ + K` ou `/` | Recherche et actions rapides |
| `Ctrl/⌘ + Entrée` | Enregistrer la tâche en cours d'édition |
| `Entrée` / `Espace` sur une carte Kanban | Ouvrir / déplacer au clavier |

---

## Modèle de données

```
users ──< sessions
users ──< task_assignees >── tasks >── projects
```

| Table | Champs principaux | Notes |
|---|---|---|
| **users** | `id`, `name`, `email` (unique, minuscules), `password_hash` (bcrypt), `role` (`admin`/`member`), `color` | Comptes créés par un admin, pas d'inscription publique |
| **sessions** | `id` = SHA-256 du jeton, `user_id`, `expires_at` | Le cookie contient le jeton, la base ne stocke que son hash (30 jours) |
| **projects** | `id`, `name`, `description`, `color`, `start_date`, `end_date`, `archived_at`, `created_by` | Archivé si `archived_at` est renseigné |
| **tasks** | `id`, `project_id`, `title`, `description`, `status` (`todo`/`in_progress`/`done`), `priority` (`low`/`medium`/`high`), `due_date`, `position`, `completed_at`, `created_by` | `position` est un flottant : insérer une carte revient à prendre la moyenne de ses voisines |
| **task_assignees** | `task_id`, `user_id` (clé composite) | Plusieurs responsables par tâche |

Règles :
- La suppression d'un projet ou d'une tâche se propage en cascade. Un membre supprimé est retiré des tâches, qui restent.
- Les dates métier sont des `DATE` sans heure, manipulées comme chaînes `YYYY-MM-DD`, donc sans décalage de fuseau.
- **Progression d'un projet** = tâches terminées ÷ total.
- **En retard** = échéance < aujourd'hui et statut ≠ Terminé (dans le fuseau `APP_TIMEZONE`).
- **Cette semaine** = d'aujourd'hui à dimanche.

## Architecture

```
src/
├── app/                      Routes (App Router)
│   ├── login/                Connexion
│   └── (app)/                Pages protégées : layout = barre latérale + contexte global
│       ├── page.tsx          Tableau de bord
│       ├── taches/           Toutes les tâches (Kanban / Liste)
│       ├── projets/          Liste des projets, puis [id] = détail du projet
│       └── membres/          Gestion des comptes (admin)
├── actions/                  Server Actions (mutations), chacune vérifie la session
├── components/
│   ├── ui/                   Briques génériques : Button, Dialog, Input, Badges, Avatar…
│   ├── layout/               AppProvider (contexte, raccourcis, toasts), AppShell, palette de recherche
│   ├── tasks/                TaskBoard, KanbanBoard, TaskList, TaskDialog, filtres
│   ├── projects/             ProjectCard, ProjectDialog
│   └── dashboard/, members/
├── db/                       Schéma Drizzle + client (Neon ou PGlite)
├── lib/                      auth, requêtes de lecture, validation (Zod), dates, constantes
└── proxy.ts                  Redirection rapide vers /login sans cookie
scripts/                      migrate, seed, create-user
drizzle/                      Migrations SQL générées
```

Principes :
- **Lectures** dans les Server Components (`lib/queries.ts`), **écritures** via les Server Actions (`actions/`), validées par Zod. Après chaque écriture, `revalidatePath` rafraîchit l'affichage.
- **Mises à jour optimistes** pour le glisser-déposer et les changements de statut : l'écran réagit immédiatement et revient en arrière en cas d'erreur.
- **Filtres et tri côté client** : une équipe de 15 personnes a au plus quelques centaines de tâches actives, donc filtrer est instantané, sans aller-retour serveur.
- **Recherche** côté serveur (`ILIKE` sur titres et descriptions, y compris les projets archivés).
- **Thème** clair, sombre ou automatique (`next-themes`), construit sur des variables CSS.
