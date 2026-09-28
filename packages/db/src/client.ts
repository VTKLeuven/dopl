import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export interface CreateDbClientOptions {
  connectionString: string;
  /** Shows up in pg_stat_activity, e.g. "dopl-web" / "dopl-worker". */
  applicationName: string;
  maxConnections?: number;
  logQueries?: boolean;
}

/**
 * Prisma 7 + driver adapter. Pool settings are explicit because the v7 `pg`
 * defaults have no connection or acquire timeout (D-010).
 */
export function createDbClient(options: CreateDbClientOptions) {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: options.applicationName,
  });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export type DbClient = ReturnType<typeof createDbClient>;
