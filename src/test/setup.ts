/**
 * Variables d'environnement des tests. Aucune valeur réelle : la clé de chiffrement est tirée
 * au hasard à chaque exécution, les identifiants Google sont factices (fetch est simulé).
 */
import { randomBytes } from "node:crypto";

process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:3000";
process.env.APP_TIMEZONE = "Europe/Paris";
