// Charge .env.local puis .env (comme Next.js) avant tout import de la base.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
