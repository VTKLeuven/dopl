import "server-only";
import { createDbClient, type DbClient } from "@dopl/db";

// One client per server process; survive HMR in dev.
const globalForDb = globalThis as unknown as { __doplDb?: DbClient };

export const db: DbClient =
  globalForDb.__doplDb ??
  createDbClient({
    connectionString: process.env.DATABASE_URL!,
    applicationName: "dopl-web",
    maxConnections: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__doplDb = db;
