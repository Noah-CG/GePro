"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { externalConnections, externalResources, type ExternalConnection } from "@/db/schema";
import { authorizeProject, authorizeProjectOf } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { deleteGoogleConnection, getConnection, withGoogleAccess } from "@/lib/integrations/connections";
import {
  errorCodeOf,
  IntegrationError,
  integrationErrorMessage,
  reportIntegrationError,
  TRANSIENT_ERRORS,
  type IntegrationErrorCode,
} from "@/lib/integrations/errors";
import { parseDocId } from "@/lib/integrations/doc-links";
import { getDoc, isGoogleConfigured, searchDocs, type GoogleDoc } from "@/lib/integrations/google";
import { attachDocInput, docSearchQuery, firstError } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

/** Document proposé dans la fenêtre de rattachement. */
export type DocOption = { id: string; title: string; updatedLabel: string | null; lastModifiedBy: string | null };

// Le layout aussi : la barre latérale liste les documents de chaque projet.
const refresh = () => revalidatePath("/", "layout");

/** Connexion Google active de l'utilisateur, sinon IntegrationError expliquant quoi faire. */
async function requireGoogleConnection(userId: string): Promise<ExternalConnection> {
  if (!isGoogleConfigured()) throw new IntegrationError("not_configured");
  const connection = await getConnection(userId, "google");
  if (!connection) throw new IntegrationError("not_connected");
  if (connection.status !== "active") throw new IntegrationError("reauth_required");
  return connection;
}

const failWith = (error: unknown) => fail(integrationErrorMessage(reportIntegrationError(error)));

/** Colonnes mises à jour à partir des métadonnées Google. */
const docColumns = (doc: GoogleDoc) => ({
  title: doc.title,
  url: doc.url,
  externalUpdatedAt: doc.modifiedAt,
  metadata: { lastModifiedBy: doc.lastModifiedBy, trashed: doc.trashed },
  syncedAt: new Date(),
  syncError: doc.trashed ? ("trashed" satisfies IntegrationErrorCode) : null,
});

export async function searchGoogleDocs(query: string): Promise<ActionResult<DocOption[]>> {
  const me = await requireUser();
  const parsed = docSearchQuery.safeParse(query);
  if (!parsed.success) return fail(firstError(parsed.error));

  try {
    const connection = await requireGoogleConnection(me.id);
    const docs = await withGoogleAccess(connection, (token) => searchDocs(token, parsed.data));
    return ok(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        updatedLabel: d.modifiedAt ? formatDateTime(d.modifiedAt.toISOString()) : null,
        lastModifiedBy: d.lastModifiedBy,
      })),
    );
  } catch (e) {
    return failWith(e);
  }
}

/** Rattache un Google Doc (lien collé ou identifiant issu de la recherche) à un projet. */
export async function attachGoogleDoc(projectId: string, link: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId);
  if (!auth.ok) return fail(auth.error);
  const me = auth.access.user;
  const parsed = attachDocInput.safeParse({ projectId, link });
  if (!parsed.success) return fail(firstError(parsed.error));

  const fileId = parseDocId(parsed.data.link);
  if (!fileId) return fail(integrationErrorMessage("invalid_link"));

  let doc: GoogleDoc;
  let connection: ExternalConnection;
  try {
    connection = await requireGoogleConnection(me.id);
    doc = await withGoogleAccess(connection, (token) => getDoc(token, fileId));
  } catch (e) {
    return failWith(e);
  }
  if (doc.trashed) return fail(integrationErrorMessage("trashed"));

  const inserted = await db
    .insert(externalResources)
    .values({
      projectId,
      provider: "google",
      kind: "google_doc",
      externalId: doc.id,
      connectionId: connection.id,
      attachedBy: me.id,
      ...docColumns(doc),
    })
    .onConflictDoNothing()
    .returning({ id: externalResources.id });
  if (inserted.length === 0) return fail("Ce document est déjà rattaché au projet.");

  refresh();
  return ok(undefined);
}

export async function detachResource(id: string): Promise<ActionResult> {
  const auth = await authorizeProjectOf("resource", id);
  if (!auth.ok) return fail(auth.error);
  const [row] = await db
    .delete(externalResources)
    .where(eq(externalResources.id, id))
    .returning({ projectId: externalResources.projectId });
  if (row) refresh();
  return ok(undefined);
}

/**
 * Rafraîchit titre, lien et date de modification des documents d'un projet, avec le compte
 * Google de la personne qui a rattaché chacun d'eux.
 *
 * Une erreur propre à un document (supprimé, accès retiré) est enregistrée sur ce document.
 * Une erreur passagère (quota, réseau) laisse le cache intact et est renvoyée à l'appelant.
 */
export async function refreshProjectResources(projectId: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId);
  if (!auth.ok) return fail(auth.error);

  const rows = await db
    .select({ resource: externalResources, connection: externalConnections })
    .from(externalResources)
    .innerJoin(externalConnections, eq(externalConnections.id, externalResources.connectionId))
    .where(and(eq(externalResources.projectId, projectId), eq(externalResources.provider, "google")));
  if (rows.length === 0) return ok(undefined);

  const byConnection = new Map<string, { connection: ExternalConnection; resources: (typeof rows)[number]["resource"][] }>();
  for (const { resource, connection } of rows) {
    const group = byConnection.get(connection.id) ?? { connection, resources: [] };
    group.resources.push(resource);
    byConnection.set(connection.id, group);
  }

  // Première erreur passagère rencontrée (assignée dans les callbacks ci-dessous).
  let transient = null as IntegrationErrorCode | null;
  const updates: Promise<unknown>[] = [];
  const setResource = (id: string, values: Partial<typeof externalResources.$inferInsert>) =>
    updates.push(db.update(externalResources).set(values).where(eq(externalResources.id, id)));

  await Promise.all(
    [...byConnection.values()].map(async ({ connection, resources }) => {
      try {
        const results = await withGoogleAccess(connection, async (token) => {
          const settled = await Promise.allSettled(resources.map((r) => getDoc(token, r.externalId)));
          // Jeton refusé : tout le lot est relancé après rafraîchissement du jeton.
          if (settled.some((s) => s.status === "rejected" && errorCodeOf(s.reason) === "unauthorized")) {
            throw new IntegrationError("unauthorized");
          }
          return settled;
        });
        results.forEach((result, i) => {
          const resource = resources[i];
          if (result.status === "fulfilled") return setResource(resource.id, docColumns(result.value));
          const code = reportIntegrationError(result.reason);
          if (TRANSIENT_ERRORS.includes(code)) transient ??= code;
          // Échec définitif (document supprimé, accès retiré…) : on le note, sans effacer le cache.
          else setResource(resource.id, { syncError: code, syncedAt: new Date() });
        });
      } catch (e) {
        // Échec du compte entier (connexion révoquée, Google injoignable).
        const code = reportIntegrationError(e);
        if (TRANSIENT_ERRORS.includes(code)) transient ??= code;
        else for (const r of resources) setResource(r.id, { syncError: code });
      }
    }),
  );
  await Promise.all(updates);

  refresh();
  return transient ? fail(integrationErrorMessage(transient)) : ok(undefined);
}

/** Déconnecte le compte Google de l'utilisateur. Les documents rattachés restent visibles. */
export async function disconnectGoogle(): Promise<ActionResult> {
  const me = await requireUser();
  const connection = await getConnection(me.id, "google");
  if (connection) await deleteGoogleConnection(connection);
  refresh();
  return ok(undefined);
}
