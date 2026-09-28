import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../.env"), quiet: true });
// Every test talks to the test database, never the dev database.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
