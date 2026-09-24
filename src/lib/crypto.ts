/**
 * Chiffrement des secrets stockés en base (jetons OAuth des intégrations).
 *
 * AES-256-GCM : chiffrement authentifié, toute modification du texte chiffré est détectée.
 * Format stocké : "v1:<iv>:<tag>:<données>" (base64url). Le préfixe de version permettra
 * de changer de clé ou d'algorithme sans casser les valeurs existantes.
 *
 * La clé vient de INTEGRATIONS_ENCRYPTION_KEY (32 octets encodés en base64) :
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  // trim() : une variable collée dans Vercel peut garder un retour à la ligne final.
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("INTEGRATIONS_ENCRYPTION_KEY manquant (voir .env.example).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("INTEGRATIONS_ENCRYPTION_KEY doit contenir 32 octets encodés en base64.");
  return key;
}

export function hasEncryptionKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
}

/** Lève une erreur si la valeur a été altérée ou chiffrée avec une autre clé. */
export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Secret chiffré illisible.");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
