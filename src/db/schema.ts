/**
 * Modèle de données GePro.
 *
 *   users ──< sessions
 *   users ──< task_assignees >── tasks >── projects
 *   tasks ──< tasks (sous-tâches, via parent_id)
 *   tasks ──< task_dependencies >── tasks
 *   users ──< external_connections ──< external_resources >── projects
 *   projects ──< project_events (projet facultatif : sans projet, événement d'équipe)
 *   projects ──< project_files ──< project_file_chunks (PDF importés, découpés en morceaux)
 *   users ──< work_sessions >── projects
 *   projects ──< project_discord (salon Discord relié) ; users ──< discord_read_state
 *   users ──o google_calendar_syncs ──< google_calendar_sync_projects >── projects
 *
 * - Une tâche appartient à un seul projet, et peut avoir plusieurs responsables.
 * - Une tâche peut avoir des sous-tâches, sur MAX_TASK_DEPTH niveaux au plus (lib/task-links.ts),
 *   et dépendre d'autres tâches du même projet ; ces règles (même projet, profondeur, pas de
 *   cycle) sont vérifiées dans actions/tasks.ts.
 * - Un projet archivé (archived_at non nul) disparaît des vues courantes mais reste consultable.
 * - Les dates "métier" (échéance, début/fin de projet) sont des DATE sans heure, manipulées
 *   comme chaînes "YYYY-MM-DD" pour éviter tout décalage de fuseau horaire.
 * - Intégrations : un utilisateur rattache un compte externe (Google, puis GitHub) ; les
 *   ressources externes (Google Docs, puis dépôts, issues…) sont rattachées à un projet.
 */
import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  customType,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "member"]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high"]);
/** "github" est déclaré d'avance : l'ajouter plus tard imposerait une migration. */
export const integrationProvider = pgEnum("integration_provider", ["google", "github"]);
export const connectionStatus = pgEnum("connection_status", ["active", "needs_reauth"]);
/** "uploading" tant que tous les morceaux du fichier ne sont pas arrivés. */
export const fileStatus = pgEnum("file_status", ["uploading", "ready"]);
/** Échéances envoyées dans Google Agenda : tâches du membre, toutes celles des projets choisis, ou aucune. */
export const calendarTasksMode = pgEnum("calendar_tasks_mode", ["mine", "all", "none"]);

/**
 * Octets bruts. Les deux drivers acceptent un Uint8Array (Neon l'envoie en hexadécimal, PGlite en
 * binaire) et renvoient des octets ; le texte hexadécimal (`\x…`) est accepté en lecture par sécurité.
 */
const bytea = customType<{ data: Uint8Array; driverData: string | Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => value,
  fromDriver: (value) => (typeof value === "string" ? Buffer.from(value.slice(2), "hex") : value),
});

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
    /** Tâche parente (nul = tâche de premier niveau). Supprimer la parente supprime ses sous-tâches. */
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("todo"),
    priority: taskPriority("priority").notNull().default("medium"),
    /** Début prévu (diagramme de Gantt). Facultatif, jamais après l'échéance. */
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    /**
     * Ordre dans une colonne Kanban. Nombre flottant : insérer une carte entre deux autres
     * revient à prendre la moyenne de leurs positions, sans renuméroter la colonne.
     */
    position: doublePrecision("position").notNull().default(0),
    /**
     * Ordre parmi les tâches sœurs (même parente, ou tâches racines du projet) dans l'arbre de la
     * vue liste. Indépendant de `position`, qui reste l'ordre dans une colonne Kanban.
     */
    siblingPosition: doublePrecision("sibling_position").notNull().default(0),
    /** Renseigné quand la tâche passe à "Terminé". */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("tasks_project_status_idx").on(t.projectId, t.status, t.position),
    index("tasks_due_date_idx").on(t.dueDate),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_project_parent_sibling_idx").on(t.projectId, t.parentId, t.siblingPosition),
  ],
);

/** Dépendances : `task_id` ne peut raisonnablement avancer qu'une fois `depends_on_id` terminée. */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    index("task_dependencies_depends_on_idx").on(t.dependsOnId),
    check("task_dependencies_not_self", sql`${t.taskId} <> ${t.dependsOnId}`),
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

/**
 * Fichier importé dans un projet (PDF pour l'instant). Le contenu est stocké à part, découpé en
 * morceaux : Vercel limite chaque requête à 4,5 Mo, l'envoi et la lecture se font donc par morceaux.
 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Nom du fichier sur l'ordinateur de la personne qui l'a importé. */
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    /** Taille en octets. */
    size: integer("size").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    status: fileStatus("status").notNull().default("uploading"),
    /** Seule cette personne (ou un admin) peut supprimer le fichier. */
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("project_files_project_idx").on(t.projectId)],
);

/** Morceaux d'un fichier, dans l'ordre de `position` (tous de même taille sauf le dernier). */
export const projectFileChunks = pgTable(
  "project_file_chunks",
  {
    fileId: uuid("file_id")
      .notNull()
      .references(() => projectFiles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.position] })],
);

/**
 * Temps de travail mesuré au chrono du tableau de bord : une ligne par période démarrée puis
 * arrêtée, avec son compte rendu facultatif. `ended_at` nul = chrono en cours ; un membre n'en a jamais qu'un seul à la fois.
 */
export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Projet sélectionné au démarrage du chrono. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Journal de bord : ce que le membre a fait pendant la période, rédigé après l'arrêt. */
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("work_sessions_user_started_idx").on(t.userId, t.startedAt),
    uniqueIndex("work_sessions_running_uq").on(t.userId).where(sql`${t.endedAt} is null`),
  ],
);

/**
 * Salon Discord relié à un projet (un au plus). Le bot lit le salon ; le webhook « GePro », créé
 * ou réutilisé au rattachement, y publie les messages écrits dans GePro. Son jeton est chiffré
 * (voir lib/crypto.ts) et ne quitte jamais le serveur. Les identifiants Discord sont des
 * snowflakes (entiers 64 bits) : stockés en texte, comparés en BigInt.
 */
export const projectDiscord = pgTable("project_discord", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  /** Copie du nom du salon au moment du rattachement (sans le #). */
  channelName: text("channel_name").notNull(),
  webhookId: text("webhook_id").notNull(),
  webhookTokenEnc: text("webhook_token_enc").notNull(),
  linkedBy: uuid("linked_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Dernier message lu par un membre dans un salon Discord : le salon est « non lu » quand son
 * dernier message est plus récent. Par salon et non par projet : deux projets reliés au même
 * salon partagent l'état de lecture.
 */
export const discordReadState = pgTable(
  "discord_read_state",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    lastReadMessageId: text("last_read_message_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
);

/**
 * Synchronisation vers Google Agenda d'un membre (une au plus) : GePro écrit dans un agenda
 * « GePro » qu'il a créé dans le compte Google du membre (connexion `external_connections`).
 * Sens unique : GePro reste la référence, l'agenda Google n'est qu'une copie.
 */
export const googleCalendarSyncs = pgTable("google_calendar_syncs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Id Google de l'agenda « GePro ». Nul tant qu'il n'est pas créé (ou s'il a été supprimé dans Google). */
  calendarId: text("calendar_id"),
  tasksMode: calendarTasksMode("tasks_mode").notNull().default("mine"),
  /** Dernière synchronisation complète réussie. */
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  /** Code d'erreur de la dernière synchronisation (voir lib/integrations/errors.ts), nul si OK. */
  lastError: text("last_error"),
  ...timestamps,
});

/** Projets choisis par le membre (les événements d'équipe, sans projet, sont toujours inclus). */
export const googleCalendarSyncProjects = pgTable(
  "google_calendar_sync_projects",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => googleCalendarSyncs.userId, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] }), index("google_calendar_sync_projects_project_idx").on(t.projectId)],
);

// Relations (pour les requêtes relationnelles `db.query.*`)

export const usersRelations = relations(users, ({ many }) => ({
  assignments: many(taskAssignees),
  sessions: many(sessions),
  connections: many(externalConnections),
  workSessions: many(workSessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tasks: many(tasks),
  resources: many(externalResources),
  events: many(projectEvents),
  files: many(projectFiles),
  discord: one(projectDiscord),
}));

export const projectFilesRelations = relations(projectFiles, ({ one, many }) => ({
  project: one(projects, { fields: [projectFiles.projectId], references: [projects.id] }),
  uploader: one(users, { fields: [projectFiles.uploadedBy], references: [users.id] }),
  chunks: many(projectFileChunks),
}));

export const projectFileChunksRelations = relations(projectFileChunks, ({ one }) => ({
  file: one(projectFiles, { fields: [projectFileChunks.fileId], references: [projectFiles.id] }),
}));

export const projectEventsRelations = relations(projectEvents, ({ one }) => ({
  project: one(projects, { fields: [projectEvents.projectId], references: [projects.id] }),
  creator: one(users, { fields: [projectEvents.createdBy], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  parent: one(tasks, { fields: [tasks.parentId], references: [tasks.id], relationName: "subtasks" }),
  subtasks: many(tasks, { relationName: "subtasks" }),
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

export const projectDiscordRelations = relations(projectDiscord, ({ one }) => ({
  project: one(projects, { fields: [projectDiscord.projectId], references: [projects.id] }),
}));

export const workSessionsRelations = relations(workSessions, ({ one }) => ({
  user: one(users, { fields: [workSessions.userId], references: [users.id] }),
  project: one(projects, { fields: [workSessions.projectId], references: [projects.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ProjectEvent = typeof projectEvents.$inferSelect;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type TaskPriority = (typeof taskPriority.enumValues)[number];
export type ExternalConnection = typeof externalConnections.$inferSelect;
export type ExternalResource = typeof externalResources.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type ProjectDiscord = typeof projectDiscord.$inferSelect;
export type IntegrationProvider = (typeof integrationProvider.enumValues)[number];
export type CalendarTasksMode = (typeof calendarTasksMode.enumValues)[number];
export type GoogleCalendarSync = typeof googleCalendarSyncs.$inferSelect;
