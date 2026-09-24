/**
 * Lecture du contenu des documents rattachés, pour la page de lecture de GePro.
 *
 * Le contenu est demandé à Google à chaque ouverture (rien n'est stocké en base), avec le
 * compte de la personne qui a rattaché le document : tout membre du projet peut donc le lire,
 * même sans accès à ce document dans Google Drive.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { externalConnections, externalResources } from "@/db/schema";
import { withGoogleAccess } from "./connections";
import { reportIntegrationError, type IntegrationErrorCode } from "./errors";
import { exportDocMarkdown } from "./google";

export type DocumentContent = { ok: true; markdown: string } | { ok: false; code: IntegrationErrorCode };

/** Contenu Markdown d'un Google Doc rattaché, ou le code d'erreur à afficher. */
export async function readDocumentContent(resourceId: string): Promise<DocumentContent> {
  const [row] = await db
    .select({ externalId: externalResources.externalId, connection: externalConnections })
    .from(externalResources)
    .leftJoin(externalConnections, eq(externalConnections.id, externalResources.connectionId))
    .where(eq(externalResources.id, resourceId))
    .limit(1);

  if (!row) return { ok: false, code: "not_found" };
  if (!row.connection) return { ok: false, code: "disconnected" };

  try {
    const markdown = await withGoogleAccess(row.connection, (token) => exportDocMarkdown(token, row.externalId));
    return { ok: true, markdown };
  } catch (e) {
    return { ok: false, code: reportIntegrationError(e) };
  }
}
