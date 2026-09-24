/**
 * Modèle de données GePro.
 *
 *   users ──< sessions
 *   users ──< task_assignees >── tasks >── projects
 *   users ──< external_connections ──< external_resources >── projects
 *   projects ──< project_events (projet facultatif : sans projet, événement d'équipe)
 *
 * - Une tâche appartient à un seul projet, et peut avoir plusieurs responsables.
 * - Un projet archivé (archived_at non nul) disparaît des vues courantes mais reste consultable.
 * - Les dates "métier" (échéance, début/fin de projet) sont des DATE sans heure, manipulées
 *   comme chaînes "YYYY-MM-DD" pour éviter tout décalage de fuseau horaire.
 * - Intégrations : un utilisateur rattache un compte externe (Google, puis GitHub) ; les
 *   ressources externes (Google Docs, puis dépôts, issues…) sont rattachées à un projet.
 */
import { relations } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "member"]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high"]);
/** "github" est déclaré d'avance : l'ajouter plus tard imposerait une migration. */
export const integrationProvider = pgEnum("integration_provider", ["google", "github"]);
export const connectionStatus = pgEnum("connection_status", ["active", "needs_reauth"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Membres de l'équipe. Les comptes sont créés par un administrateur. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Toujours stocké en minuscules. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("member"),
  /** Couleur de l'avatar (pastille avec initiales). */
  color: text("color").notNull().default("#6366f1"),
  ...timestamps,
});

/** Sessions de connexion. L'id est le hash SHA-256 du jeton stocké dans le cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#6366f1"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  /** Non nul = projet archivé. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("todo"),
    priority: taskPriority("priority").notNull().default("medium"),
    dueDate: date("due_date", { mode: "string" }),
    /**
     * Ordre dans une colonne Kanban. Nombre flottant : insérer une carte entre deux autres
     * revient à prendre la moyenne de leurs positions, sans renuméroter la colonne.
     */
    position: doublePrecision("position").notNull().default(0),
    /** Renseigné quand la tâche passe à "Terminé". */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("tasks_project_status_idx").on(t.projectId, t.status, t.position),
    index("tasks_due_date_idx").on(t.dueDate),
  ],
);

/** Liaison N-N : responsables d'une tâche. */
export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

/**
 * Événements du calendrier (réunion, jalon, livraison…), distincts des tâches.
 * Sans projet, c'est un événement d'équipe, affiché dans le calendrier de chaque projet.
 */
export const projectEvents = pgTable(
  "project_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Date métier "YYYY-MM-DD", comme les échéances des tâches. */
    eventDate: date("event_date", { mode: "string" }).notNull(),
    color: text("color").notNull().default("#6366f1"),
    /** Seul le créateur (ou un admin) peut modifier ou supprimer l'événement. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("project_events_project_date_idx").on(t.projectId, t.eventDate)],
);

/**
 * Compte externe rattaché à un utilisateur (un seul par fournisseur).
 * Les jetons sont chiffrés (AES-256-GCM, voir lib/crypto.ts) et ne quittent jamais le serveur.
 */
export const externalConnections = pgTable(
  "external_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    /** Identifiant stable du compte chez le fournisseur. */
    accountId: text("account_id").notNull(),
    accountEmail: text("account_email").notNull().default(""),
    /** Scopes réellement accordés, séparés par des espaces. */
    scopes: text("scopes").notNull().default(""),
    /** Nuls une fois la connexion passée en "needs_reauth" : on n'y conserve rien d'inutilisable. */
    accessTokenEnc: text("access_token_enc"),
    /** Nul pour les fournisseurs dont les jetons n'expirent pas (GitHub OAuth App). */
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    /** "needs_reauth" : jeton révoqué ou expiré, l'utilisateur doit se reconnecter. */
    status: connectionStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [unique("external_connections_user_provider_uq").on(t.userId, t.provider)],
);

/**
 * Ressource externe rattachée à un projet. Titre, lien et date de modification sont une copie
 * en cache, rafraîchie avec le compte de `connection_id`.
 * `kind` est un texte libre (validé côté application) et `metadata` un JSON propre au
 * fournisseur : ajouter GitHub ne demande pas de nouvelle colonne.
 */
export const externalResources = pgTable(
  "external_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    /** "google_doc" ; plus tard "github_repo", "github_issue"… */
    kind: text("kind").notNull(),
    /** Identifiant chez le fournisseur : id du fichier Drive, "owner/repo#42"… */
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    /** Dernière modification côté fournisseur. */
    externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    /** Compte utilisé pour la synchronisation. Nul si ce compte a été déconnecté. */
    connectionId: uuid("connection_id").references(() => externalConnections.id, { onDelete: "set null" }),
    attachedBy: uuid("attached_by").references(() => users.id, { onDelete: "set null" }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    /** Code d'erreur de la dernière synchronisation (voir lib/integrations/errors.ts), nul si OK. */
    syncError: text("sync_error"),
    ...timestamps,
  },
  (t) => [
    unique("external_resources_project_external_uq").on(t.projectId, t.provider, t.externalId),
    index("external_resources_connection_idx").on(t.connectionId),
  ],
);

// Relations (pour les requêtes relationnelles `db.query.*`)

export const usersRelations = relations(users, ({ many }) => ({
  assignments: many(taskAssignees),
  sessions: many(sessions),
  connections: many(externalConnections),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
  resources: many(externalResources),
  events: many(projectEvents),
}));

export const projectEventsRelations = relations(projectEvents, ({ one }) => ({
  project: one(projects, { fields: [projectEvents.projectId], references: [projects.id] }),
  creator: one(users, { fields: [projectEvents.createdBy], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignees: many(taskAssignees),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}));

export const externalConnectionsRelations = relations(externalConnections, ({ one, many }) => ({
  user: one(users, { fields: [externalConnections.userId], references: [users.id] }),
  resources: many(externalResources),
}));

export const externalResourcesRelations = relations(externalResources, ({ one }) => ({
  project: one(projects, { fields: [externalResources.projectId], references: [projects.id] }),
  connection: one(externalConnections, {
    fields: [externalResources.connectionId],
    references: [externalConnections.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ProjectEvent = typeof projectEvents.$inferSelect;
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type TaskPriority = (typeof taskPriority.enumValues)[number];
export type ExternalConnection = typeof externalConnections.$inferSelect;
export type ExternalResource = typeof externalResources.$inferSelect;
export type IntegrationProvider = (typeof integrationProvider.enumValues)[number];
