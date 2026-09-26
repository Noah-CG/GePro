# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

GePro is a project-management app for small teams (projects, tasks with Kanban/list/Gantt, calendar, time tracking, PDFs, Google Docs, Google Calendar sync, Discord channel per project). Stack: Next.js 16 App Router + Server Actions, React 19, Drizzle ORM on Postgres (Neon in prod, PGlite locally), Tailwind 4, Radix/shadcn-style components copied into `src/components/ui`, Zod 4, Vitest. Deployed on Vercel.

**Everything is in French**: UI strings, route segments (`/projets`, `/taches`, `/calendrier`, `/temps`, `/membres`, `/parametres`), code comments, docs and commit messages (Conventional Commits with a scope, e.g. `feat(agenda): …`, `docs(discord): …`). Keep that convention. The README is the main reference for features and setup; `docs/discord.md` covers the Discord bot.

## Commands

```bash
npm run dev                  # http://localhost:3000 (demo login: camille@exemple.fr / demo1234)
npm run build
npm run lint                 # = typecheck (tsc --noEmit); there is no ESLint
npm test                     # vitest run
npx vitest run src/lib/gantt.test.ts      # single file
npx vitest run -t "nom du test"           # single test by name
npm run db:generate          # new SQL migration in drizzle/ after editing src/db/schema.ts
npm run db:migrate           # apply migrations (Neon if DATABASE_URL set, else ./.pglite)
npm run db:seed [-- --reset] # demo data (--reset wipes ALL data)
npm run user:create -- --name "…" --email … --password … --admin
```

Without `DATABASE_URL`, the app uses an embedded PGlite database in `.pglite/` that only allows **one process at a time**: stop `npm run dev` before running any `db:*` script. On Vercel, migrations run as part of the build (`vercel.json`).

## Architecture

- **Reads** happen in Server Components through `src/lib/queries.ts`; **writes** go through Server Actions in `src/actions/`. Each action starts with `requireUser()` / `requireAdmin()` (`src/lib/auth.ts`) — or, for anything touching project data, `authorizeProject` / `authorizeProjectOf` (`src/lib/access.ts`) — validates input with Zod schemas from `src/lib/validation.ts`, returns an `ActionResult` (`ok(data)` / `fail(message)` from `src/actions/result.ts`, messages in French), then calls `revalidatePath("/", "layout")`. The client uses optimistic updates for drag-and-drop/status changes and rolls back on `ok: false`.
- **Auth**: email/password with DB-stored sessions (cookie `gepro_session` holds a random token, DB stores its SHA-256). `src/proxy.ts` (Next 16's replacement for middleware) only checks the cookie exists; real validation happens in each page/action.
- **DB client** (`src/db/index.ts`): a lazy Proxy picking Neon HTTP or PGlite. The Neon HTTP driver has **no interactive transactions**, so application code must not use `db.transaction`. Schema lives in `src/db/schema.ts`; migrations in `drizzle/` are generated, not hand-written — except when existing data must be migrated: `0011_isolation_projets.sql` was generated then rewritten as a single idempotent `DO` block (atomic on Neon, whose migrator runs statements without a transaction), with its rollback in `scripts/rollback/` and a read-only preview (`npm run db:isolation-preview`).
- **Project isolation** (security-critical): users only see projects they are members of (`project_members`, roles `owner` > `admin` > `member`); joining is by invitation only (`project_invitations`, exact email, hashed token). Every page, API route and action touching project data must go through `src/lib/access.ts`: `requireProjectAccess` / `loadProjectPage` (`src/lib/project-page.ts`) in pages and `generateMetadata` (→ 404), `authorizeProject(projectId, minRole)` or `authorizeProjectOf(kind, id)` in actions, `getProjectRole` in API routes (→ 404). A non-member gets exactly the same response as for a nonexistent project/object; never trust a client-sent `project_id`. Cross-project reads in `queries.ts` take a `viewerId` and filter with `memberProjectIds`. The global `users.role = admin` only manages accounts and grants no project access. `src/test/isolation-projets.test.ts` is the end-to-end guard (users A/B).
- **Current project = URL**: project pages live under `/projets/[id]/…` (tasks, `tableau-de-bord`, `calendrier`, `calendrier/journees`, `temps`, `documents`, `parametres`, `discord`). The `gepro_projet` cookie only picks where `/`, `/taches`, `/calendrier`, `/temps` redirect (`redirectToSelectedProject`), always among the user's projects; resolution rules are in `src/lib/current-project.ts` (pure, tested) with the server wrapper in `src/lib/selected-project.ts`.
- **Atomic writes without transactions**: when several rows must change together (create project + owner membership, accept invitation, transfer ownership), use a single SQL statement (CTE) or a SQL function (`transfer_project_ownership`, created in migration 0011), never `db.transaction`.
- **In-app tabs**: the `(app)` layout provides GePro's own tab bar (`src/lib/tabs.ts`, `components/layout/tabs.tsx`), persisted per user in `localStorage`; internal links opened with Ctrl/middle-click open a GePro tab.
- **Integrations** (`src/lib/integrations/`, `src/lib/discord/`): direct REST calls to Google (OAuth, Drive/Docs export to Markdown, Calendar) and Discord, no SDKs. Google integration is optional and disabled unless `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` are all set; OAuth tokens are encrypted (`src/lib/crypto.ts`). Errors are mapped to codes (`lib/integrations/errors.ts`, `lib/discord/errors.ts`) and translated to messages only at display time. Google Calendar sync is pushed after mutations via `scheduleCalendarSync` (runs in `after()` so actions aren't slowed). Discord has no WebSocket (serverless): the UI polls `/api/projects/[id]/discord/*` routes.
- **Forms**: no native `<select>` or date inputs — use `components/ui/select.tsx` and `components/ui/date-picker.tsx` (French locale, Monday-first). Buttons that trigger actions use the `loading` prop of `components/ui/button.tsx`; every route has a `loading.tsx` skeleton.
- Filtering/sorting of tasks is client-side (small data volumes); search is server-side `ILIKE`.

## Tests

Tests sit next to the code (`*.test.ts`, `*.test.tsx` rendered with `react-dom/server`), Node environment. Conventions:
- DB: in-memory PGlite with the real migrations — `vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }))`, plus `resetDb` / `insertUser` / `insertProject` helpers from `src/test/db.ts`.
- Google and Discord are faked by stubbing `fetch` (`src/test/google.ts`, `src/test/google-calendar.ts`, `src/test/discord.ts`); no network access.
- `next/headers`, `next/cache`, `next/navigation` and `@/lib/auth` are replaced with `vi.mock` where needed. `server-only` is aliased to an empty module, and `src/test/setup.ts` sets fake env vars (random encryption key, fake OAuth/Discord credentials).
