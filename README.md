# GePro

Application de gestion de projet pour petites équipes (5 à 15 personnes) : projets, tâches, Kanban, liste filtrable, tableau de bord, recherche rapide et Google Docs rattachés aux projets.

**Stack** : Next.js 16 (App Router, Server Actions) · Neon Postgres · Drizzle ORM · Tailwind CSS 4 · composants Radix UI façon shadcn/ui · react-day-picker · dnd-kit · cmdk · Vitest.

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

## Intégration Google Docs

Chaque membre peut connecter son compte Google (en **lecture seule**) depuis les paramètres d'un projet, puis rattacher des Google Docs au projet. La page du projet affiche pour chaque document son titre, son lien et sa date de dernière modification ; tout membre peut en rattacher ou en détacher.

L'intégration est facultative : tant que les quatre variables `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `INTEGRATIONS_ENCRYPTION_KEY` ne sont pas toutes renseignées, elle est simplement désactivée.

### 1. Créer les identifiants OAuth dans Google Cloud Console

Les libellés ci-dessous sont ceux de la console en français ; l'équivalent anglais est entre parenthèses.

1. **Projet** : ouvrez [console.cloud.google.com](https://console.cloud.google.com), cliquez sur le sélecteur de projet en haut de la page, puis **Nouveau projet** (*New project*). Nommez-le par exemple `GePro`.
2. **Activer l'API Google Drive** : menu **API et services → Bibliothèque** (*APIs & Services → Library*), recherchez **Google Drive API**, puis **Activer** (*Enable*). Sans cette étape, GePro affichera une erreur de configuration.
3. **Écran de consentement** : menu **Google Auth Platform** (ou **API et services → Écran de consentement OAuth**), puis **Commencer** (*Get started*) :
   - **Informations sur l'application** (*App information*) : nom `GePro`, adresse e-mail d'assistance.
   - **Audience** : choisissez le type d'application.
     - **Interne** (*Internal*) si toute l'équipe utilise des comptes Google Workspace de votre organisation. **C'est le choix recommandé** : pas de vérification Google, et les autorisations n'expirent pas au bout de 7 jours.
     - **Externe** (*External*) dans les autres cas (comptes @gmail.com, par exemple). L'application reste en mode **Test** : ajoutez chaque membre dans **Audience → Utilisateurs test** (*Test users*, 100 au maximum).
   - **Coordonnées** (*Contact information*) : votre adresse e-mail. Acceptez les conditions, puis **Créer**.
4. **Scope** : **Accès aux données** (*Data Access*) → **Ajouter ou supprimer des champs d'application** (*Add or remove scopes*). Cochez `https://www.googleapis.com/auth/drive.readonly` (*Google Drive API, afficher et télécharger tous vos fichiers Google Drive*), puis **Mettre à jour** et **Enregistrer**. C'est le seul scope demandé par GePro.
5. **Client OAuth** : **Clients** → **Créer un client** (*Create client*) :
   - Type d'application : **Application Web** (*Web application*). Nom : `GePro`.
   - **URI de redirection autorisés** (*Authorized redirect URIs*) : ajoutez une URI par environnement, en respectant exactement la valeur de `APP_URL` :
     - `http://localhost:3000/api/integrations/google/callback` (développement)
     - `https://votre-app.vercel.app/api/integrations/google/callback` (production)
   - Les « Origines JavaScript autorisées » ne sont pas nécessaires : tout l'échange OAuth se fait côté serveur.
   - **Créer**, puis copiez l'**ID client** et le **Code secret du client**. Téléchargez aussi le JSON : la console ne réaffiche plus le code secret par la suite.

> **À savoir sur `drive.readonly`** : Google classe ce scope comme *restreint*.
> - En mode **Test** (application Externe), Google fait **expirer les autorisations au bout de 7 jours**. GePro détecte l'expiration et propose « Reconnecter » ; les documents déjà rattachés restent visibles avec leurs dernières informations connues.
> - Pour publier une application **Externe** en production, Google exige une vérification de l'application et une évaluation de sécurité annuelle.
> - Une application **Interne** n'est soumise à aucune de ces deux contraintes.

### 2. Configurer les variables d'environnement

Dans `.env.local` (voir `.env.example`) :

```env
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
INTEGRATIONS_ENCRYPTION_KEY=…
```

Générez la clé de chiffrement (32 octets aléatoires) avec :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Utilisez une clé différente par environnement et ne la versionnez jamais. Si elle change, les jetons déjà enregistrés deviennent illisibles et chaque membre devra reconnecter son compte Google.

Appliquez ensuite la migration (`npm run db:migrate`) et relancez `npm run dev`.

**Sur Vercel** : ajoutez les quatre variables dans *Settings → Environment Variables*, avec `APP_URL` égal à l'adresse de production, et déclarez l'URI de redirection de production dans le client OAuth (étape 5). Chaque déploiement de prévisualisation a sa propre adresse et Google n'accepte pas de joker dans les URI de redirection : la connexion Google n'y fonctionne que si vous déclarez leur URI exacte. La migration est appliquée automatiquement au déploiement (`buildCommand` de `vercel.json`).

### 3. Utilisation

1. Sélectionnez le projet (sélecteur en haut de la barre latérale), puis **Paramètres du projet** (en bas) → **Connecter mon compte Google**.
2. Section **Documents** → **+** (ou **Lier un Google Doc**) : recherchez un document par son titre ou collez son lien (le format du lien est vérifié dès la saisie).
3. Les documents liés apparaissent dans la section **Documents**. Un clic ouvre le document **en lecture seule dans GePro**, dans un onglet GePro à lui (l'onglet en cours est conservé) : son contenu complet (titres, listes, tableaux, liens, images) est demandé à Google à chaque ouverture, au format Markdown. Sur la page du document, **Actualiser** relit le document chez Google (dernières modifications) et **Ouvrir dans Google Docs** mène à l'original.
4. Titre et date de modification sont gardés en cache et rafraîchis en arrière-plan s'ils datent de plus de 15 minutes (ou avec **Actualiser** sur la page Documents).

Chaque document est lu et synchronisé avec le compte Google de la personne qui l'a rattaché. **Tout membre de GePro peut donc lire un document rattaché, même sans y avoir accès dans Google Drive** : ne rattachez que des documents destinés à toute l'équipe.

### Sécurité

- Les jetons OAuth (accès et refresh) sont chiffrés en base (AES-256-GCM, `src/lib/crypto.ts`), ne sont déchiffrés qu'au moment d'appeler Google et ne sont jamais envoyés au navigateur.
- La connexion est protégée par un `state` aléatoire (contre les requêtes forgées) et par PKCE. Tous deux sont stockés dans un cookie httpOnly de 10 minutes, distinct de la session GePro.
- Si l'utilisateur décoche l'accès à Drive sur l'écran de consentement, la connexion est refusée et l'autorisation révoquée.
- Quand un refresh token est révoqué ou expiré, la connexion passe à l'état « à reconnecter » et ses jetons sont effacés. **Déconnecter** révoque l'autorisation chez Google.
- Le contenu des documents est affiché avec `react-markdown`, qui n'interprète jamais le HTML présent dans le texte et neutralise les liens dangereux (`javascript:`…). Seules les images intégrées par Google (PNG, JPEG, GIF, WebP en base64) sont acceptées. Le contenu n'est jamais stocké en base.

### Dépannage

| Symptôme | Cause et solution |
|---|---|
| Google affiche `Erreur 400 : redirect_uri_mismatch` | L'URI `<APP_URL>/api/integrations/google/callback` n'est pas déclarée à l'identique dans le client OAuth (protocole, port, `/` final). |
| Google affiche « Accès bloqué : l'application n'a pas terminé la procédure de validation » | Application Externe en mode Test : ajoutez l'utilisateur dans **Audience → Utilisateurs test**. |
| GePro affiche « L'intégration Google est mal configurée côté serveur » | API Google Drive non activée (étape 2), ou `GOOGLE_CLIENT_SECRET` incorrect. |
| Il faut se reconnecter chaque semaine | Application Externe en mode Test : les autorisations expirent au bout de 7 jours (voir plus haut). |
| « Non configurée sur ce serveur » dans les paramètres du projet | Une des quatre variables manque, ou `INTEGRATIONS_ENCRYPTION_KEY` ne fait pas 32 octets. Redémarrez le serveur après toute modification. |

## Documents PDF

Chaque projet peut aussi recevoir des **PDF importés depuis l'ordinateur**, lisibles par toute l'équipe dans GePro, en lecture seule. Aucune configuration n'est nécessaire.

- **Importer** : **+** de la section Documents de la barre latérale, puis *Importer un PDF*, ou page **Documents** du projet (bouton ou glisser-déposer, plusieurs fichiers à la fois). 20 Mo au plus par fichier. Un PDF importé seul s'ouvre aussitôt dans un nouvel onglet GePro.
- **Lire** : le lecteur de GePro affiche les pages telles qu'elles sont dans le PDF (texte, images, mise en page), sans iframe. Le texte se sélectionne, se copie et se trouve avec Ctrl+F (sur les pages déjà affichées). Zoom, ajustement à la largeur, accès direct à une page, liens cliquables, bouton **Télécharger**.
- **Supprimer** : réservé à la personne qui a importé le fichier et aux administrateurs.

Fonctionnement :

- Le lecteur repose sur [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`, la bibliothèque du lecteur PDF de Firefox), chargé uniquement à l'ouverture d'un PDF. Chaque page est dessinée dans un `<canvas>`, sous un calque de texte transparent ; seules les pages proches de l'écran sont téléchargées et dessinées.
- Les fichiers sont stockés **dans la base Postgres** (Neon, ou PGlite en local), découpés en morceaux de 960 Ko (`project_file_chunks`). Vercel limite chaque requête à 4,5 Mo et une Server Action à 1 Mo : l'import envoie donc un morceau par requête, et la route `/api/fichiers/[id]` sert le fichier par plages d'octets (`Range`), ce qui permet à pdf.js de ne demander que les morceaux utiles. Comptez la place sur le quota Neon : 0,5 Go dans l'offre gratuite.
- Les fichiers annexes de pdf.js (polices standard, tables de caractères, décodeurs d'images JBIG2 et JPEG 2000 des PDF scannés) sont servis depuis `node_modules/pdfjs-dist` par la route `/api/pdfjs/…` (voir `outputFileTracingIncludes` dans `next.config.ts`).
- Un import interrompu (onglet fermé, coupure) reste invisible et est supprimé au bout d'un jour.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement, build, production |
| `npm run lint` | Vérification TypeScript |
| `npm test` / `npm run test:watch` | Tests (Vitest) |
| `npm run db:generate` | Génère une migration SQL après modification de `src/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations (Neon ou base locale) |
| `npm run db:seed [-- --reset]` | Charge la démo (`--reset` efface d'abord **toutes** les données) |
| `npm run user:create -- …` | Crée un compte en ligne de commande |

## Raccourcis clavier

| Touche | Action |
|---|---|
| `N` | Nouvelle tâche (dans le projet sélectionné) |
| `P` | Nouveau projet |
| `Ctrl/⌘ + K` ou `/` | Recherche et actions rapides |
| `Ctrl/⌘ + Entrée` | Enregistrer la tâche en cours d'édition |
| `Entrée` / `Espace` sur une carte Kanban | Ouvrir / déplacer au clavier |
| `Ctrl/⌘ + clic` ou clic du milieu sur un lien | Ouvrir dans un nouvel onglet GePro |
| `←` / `→`, `Début` / `Fin` sur la barre d'onglets | Passer d'un onglet à l'autre (`Entrée` pour l'afficher, `Suppr` pour le fermer) |

---

## Modèle de données

```
users ──< sessions
users ──< task_assignees >── tasks >── projects
users ──< external_connections ──< external_resources >── projects
projects ──< project_events
projects ──< project_files ──< project_file_chunks
```

| Table | Champs principaux | Notes |
|---|---|---|
| **users** | `id`, `name`, `email` (unique, minuscules), `password_hash` (bcrypt), `role` (`admin`/`member`), `color` | Comptes créés par un admin, pas d'inscription publique |
| **sessions** | `id` = SHA-256 du jeton, `user_id`, `expires_at` | Le cookie contient le jeton, la base ne stocke que son hash (30 jours) |
| **projects** | `id`, `name`, `description`, `color`, `start_date`, `end_date`, `archived_at`, `created_by` | Archivé si `archived_at` est renseigné |
| **tasks** | `id`, `project_id`, `title`, `description`, `status` (`todo`/`in_progress`/`done`), `priority` (`low`/`medium`/`high`), `due_date`, `position`, `completed_at`, `created_by` | `position` est un flottant : insérer une carte revient à prendre la moyenne de ses voisines |
| **task_assignees** | `task_id`, `user_id` (clé composite) | Plusieurs responsables par tâche |
| **project_events** | `id`, `project_id` (facultatif), `title`, `description`, `event_date`, `color`, `created_by` | Événements du calendrier. Sans projet : événement d'équipe, visible dans tous les projets. Modifiables par leur créateur ou un admin |
| **project_files** | `id`, `project_id`, `name`, `mime_type`, `size`, `chunk_count`, `status` (`uploading`/`ready`), `uploaded_by` | PDF importés. Invisibles tant que l'import n'est pas terminé. Supprimables par la personne qui les a importés ou un admin |
| **project_file_chunks** | `file_id`, `position` (clé composite), `data` (`bytea`) | Contenu des fichiers, en morceaux de 960 Ko |
| **external_connections** | `user_id`, `provider` (`google`/`github`), `account_email`, `access_token_enc`, `refresh_token_enc`, `access_token_expires_at`, `status` (`active`/`needs_reauth`) | Un compte externe par utilisateur et par fournisseur ; jetons chiffrés |
| **external_resources** | `project_id`, `provider`, `kind` (`google_doc`…), `external_id`, `title`, `url`, `external_updated_at`, `metadata` (JSON), `connection_id`, `attached_by`, `synced_at`, `sync_error` | Ressources externes rattachées à un projet (copie en cache), uniques par (`project_id`, `provider`, `external_id`) |

Règles :
- La suppression d'un projet ou d'une tâche se propage en cascade. Un membre supprimé est retiré des tâches, qui restent.
- Les tables d'intégration sont génériques : pour ajouter GitHub (dépôts, issues, PR), il suffira de nouvelles valeurs de `kind` et de `metadata`, sans nouvelle migration. La valeur `github` de `provider` existe déjà.
- Les dates métier sont des `DATE` sans heure, manipulées comme chaînes `YYYY-MM-DD`, donc sans décalage de fuseau.
- **Progression d'un projet** = tâches terminées ÷ total.
- **En retard** = échéance < aujourd'hui et statut ≠ Terminé (dans le fuseau `APP_TIMEZONE`).
- **Cette semaine** = d'aujourd'hui à dimanche.

## Navigation

### Projet sélectionné

GePro affiche **un projet à la fois** : la barre latérale, le tableau de bord, les tâches et la recherche (`Ctrl/⌘ + K`) ne montrent que le projet sélectionné. On en change avec le **sélecteur tout en haut de la barre latérale** (liste filtrable au clavier, « Nouveau projet », « Tous les projets »). Ouvrir la page d'un projet le sélectionne aussi. Le choix est mémorisé dans le cookie `gepro_projet` (préférence d'affichage, sans lien avec la session).

Seules restent communes à tous les projets : la liste **Tous les projets** (pour les gérer, archiver…) et la gestion des **membres**. L'ancienne adresse `/taches` renvoie vers les tâches du projet sélectionné, filtres compris.

### Barre latérale

De haut en bas :

- le **sélecteur de projet** ;
- **Nouvelle tâche** et **Rechercher** ;
- **Tableau de bord**, **Tâches** (avec le nombre de tâches ouvertes) et **Calendrier** du projet, **Temps de travail** (pastille verte quand votre chrono tourne), puis **Multi-écran** (jusqu'à 4 vidéos YouTube côte à côte) ;
- **Documents** : les Google Docs et les PDF du projet, le **+** pour importer un PDF ou lier un Google Doc, et un lien vers la page de gestion ;
- **Administration** (admin) : membres ;
- tout en bas, **Paramètres du projet** et le menu du compte (thème, mot de passe, déconnexion).

Le bouton à côté du sélecteur **réduit la barre** aux icônes (avec info-bulles, au survol comme au clavier). Les sections se replient d'un clic sur leur titre. Ces choix sont mémorisés dans les cookies `gepro_sidebar_reduite` et `gepro_sections_repliees`. Sur mobile, la barre s'ouvre en tiroir depuis le bouton ☰ de l'en-tête.

### Calendrier

`/calendrier` affiche, pour le projet sélectionné, les **tâches à leur échéance** et les **événements** (réunions, jalons…), plus les événements d'équipe (sans projet).

- Vues **Mois** (au plus 3 éléments par jour, puis « +N autres » qui ouvre la semaine) et **Semaine** (tout le contenu), flèches précédent / suivant et « Aujourd'hui ». La vue et la date sont dans l'adresse (`?vue=mois&date=2026-09-24`) : la page est partageable et rechargeable.
- Une tâche s'ouvre dans la fenêtre de tâche habituelle ; terminée, elle est barrée et atténuée ; en retard, elle porte une icône d'alerte.
- Un clic sur une zone vide d'un jour (ou Entrée) crée un événement à cette date. Un événement n'est modifiable ou supprimable que par son créateur ou un admin.
- Au clavier, la grille n'a qu'un arrêt de tabulation : flèches pour changer de jour, `Début` / `Fin` pour le lundi / dimanche, `Page préc.` / `Page suiv.` pour la période voisine, `Tab` pour atteindre les éléments du jour.
- Sous 768 px, le calendrier devient la liste des jours qui ont du contenu.
- Chaque vue ne fait qu'une requête, bornée sur les jours affichés (`getCalendarItems`).

### Temps de travail

La page **Temps de travail** (`/temps`) regroupe tout ce qui concerne le chrono :

- le **chrono** : un clic pour démarrer, un clic pour arrêter. La période est rattachée au projet sélectionné, et à l'arrêt un bandeau propose d'en rédiger le journal ;
- le temps **du jour**, **de la semaine** et **au total** ;
- le **journal de bord** : chaque période avec ce qui y a été fait ;
- le **temps par projet** ;
- le temps de **l'équipe** sur le projet sélectionné cette semaine, avec les chronos en cours.

Le temps se corrige depuis le journal. **Ajouter une période** couvre un chrono oublié, et le crayon d'une période en corrige la date, les heures, le projet et le journal, ou la supprime. Corriger un chrono en cours l'arrête à l'heure saisie.

- Les heures se tapent librement (« 9h30 », « 930 », « 18:15 ») et sont lues dans le fuseau de l'équipe (`APP_TIMEZONE`).
- Une fin antérieure au début tombe le lendemain.
- Une période ne peut ni se terminer dans le futur ni chevaucher une autre période du même membre.

Chacun corrige son propre temps. Un administrateur peut consulter et corriger celui de tous les membres, avec le sélecteur de membre en haut de la page (`/temps?membre=<id>`).

### Onglets

Au-dessus du contenu, une barre d'onglets permet de garder plusieurs pages ouvertes (un autre projet, un Google Doc…). Chaque onglet mémorise une adresse de GePro : changer d'onglet affiche sa page, à la position de défilement où on l'avait laissée. Les filtres des tâches et la vue Kanban/Liste sont dans l'adresse, donc propres à chaque onglet.

- **Ouvrir** : `Ctrl/⌘ + clic` ou clic du milieu sur n'importe quel lien interne, **Ouvrir dans un nouvel onglet** dans le menu ⋯ d'un projet, ou le **+** de la barre d'onglets. Un vrai onglet du navigateur reste accessible par clic droit → *Ouvrir le lien dans un nouvel onglet*.
- **Documents** : un Google Doc ou un PDF s'ouvre toujours dans un onglet à lui, sans quitter la page en cours ; s'il est déjà ouvert, son onglet est simplement réactivé.
- **Fermer** : la croix, le clic du milieu, ou `Suppr` sur l'onglet sélectionné. Le dernier onglet ne se ferme pas.
- 10 onglets au maximum. Ils sont mémorisés dans ce navigateur (`localStorage`, par utilisateur) et retrouvés au prochain passage.

## Architecture

```
src/
├── app/                      Routes (App Router)
│   ├── login/                Connexion
│   └── (app)/                Pages protégées : layout = barre latérale + contexte global
│       ├── page.tsx          Tableau de bord du projet sélectionné
│       ├── taches/           Redirige vers les tâches du projet sélectionné (anciens liens)
│       ├── calendrier/       Calendrier du projet sélectionné (vues Mois / Semaine)
│       ├── temps/            Temps de travail : chrono, journal de bord corrigeable, temps de l'équipe
│       ├── projets/          Liste des projets ; [id] = tâches, [id]/documents(/[docId], /pdf/[fileId]) = documents et lecture, [id]/parametres
│       └── membres/          Gestion des comptes (admin)
│   └── api/                  integrations/ (OAuth : connect → Google → callback), fichiers/[id] (contenu des PDF), pdfjs/ (fichiers annexes du lecteur)
├── actions/                  Server Actions (mutations), chacune vérifie la session
├── components/
│   ├── ui/                   Briques génériques : Button, Dialog, Input, Select, DatePicker, Calendar, Badges, Avatar…
│   ├── layout/               AppProvider (contexte, raccourcis, toasts), AppShell, barre latérale (sidebar*), onglets, sélecteur de projet, palette de recherche
│   ├── tasks/                TaskBoard, KanbanBoard, TaskList, TaskDialog, filtres
│   ├── projects/             ProjectCard, ProjectDialog
│   ├── integrations/         Connexion Google, page Documents, fenêtre de rattachement, lecture Markdown
│   ├── calendar/             Grilles Mois / Semaine, liste mobile, tâches et événements, fenêtre d'événement
│   ├── files/                Lecteur PDF (pdf.js), import par morceaux, liste des PDF du projet
│   ├── time/                 Chrono, journal de bord, fenêtre d'ajout / correction d'une période
│   └── dashboard/, members/
├── db/                       Schéma Drizzle + client (Neon ou PGlite)
├── lib/                      auth, requêtes de lecture, validation (Zod), dates, calendrier, fichiers (découpage, plages d'octets), constantes, chiffrement, onglets, préférences de navigation
│   └── integrations/         Client Google (OAuth + Drive, export Markdown), jetons, état OAuth, lecture des documents, erreurs
├── test/                     Utilitaires de test : base PGlite en mémoire, faux Google
└── proxy.ts                  Redirection rapide vers /login sans cookie
scripts/                      migrate, seed, create-user
drizzle/                      Migrations SQL générées
```

Principes :
- **Lectures** dans les Server Components (`lib/queries.ts`), **écritures** via les Server Actions (`actions/`), validées par Zod. Après chaque écriture, `revalidatePath` rafraîchit l'affichage.
- **Retour visuel** : un bouton qui lance une action affiche un spinner et se désactive jusqu'à la réponse (`loading` de `components/ui/button.tsx`), et les liens de la barre latérale tournent le temps que la page se charge. Chaque page a un squelette (`loading.tsx`, briques dans `components/ui/skeleton.tsx`) affiché dès le clic : il annonce le chargement aux lecteurs d'écran et ne s'anime pas si le système demande moins de mouvement.
- **Mises à jour optimistes** pour le glisser-déposer et les changements de statut : l'écran réagit immédiatement et revient en arrière en cas d'erreur.
- **Filtres et tri côté client** : une équipe de 15 personnes a au plus quelques centaines de tâches actives, donc filtrer est instantané, sans aller-retour serveur.
- **Recherche** côté serveur (`ILIKE` sur titres et descriptions, y compris les projets archivés).
- **Thème** clair, sombre ou automatique (`next-themes`), construit sur des variables CSS.
- **Champs de formulaire** : aucun contrôle natif du navigateur pour les listes et les dates. `components/ui/select.tsx` (Radix Select) et `components/ui/date-picker.tsx` (calendrier `react-day-picker` en français, semaine du lundi) reprennent les composants de shadcn/ui, recopiés et adaptés aux couleurs de l'app plutôt qu'installés via `npx shadcn init`, qui remplacerait le thème existant.
- **Intégrations** : appels REST directs à Google, sans SDK. Chaque erreur est traduite en code (`lib/integrations/errors.ts`), et le code en message lisible au moment de l'affichage.

## Tests

`npm test` lance Vitest. Les tests sont placés à côté du code testé (`*.test.ts`, `*.test.tsx` pour les composants rendus avec `react-dom/server`) :
- la base de données est une instance PGlite **en mémoire**, créée avec les vraies migrations (`src/test/db.ts`) ;
- Google est simulé en remplaçant `fetch` (`src/test/google.ts`) : aucun appel réseau, aucun identifiant réel ;
- les modules propres à Next.js (`next/headers`, `next/cache`, `next/navigation`) et la session (`@/lib/auth`) sont remplacés par `vi.mock` dans les tests qui en ont besoin.
