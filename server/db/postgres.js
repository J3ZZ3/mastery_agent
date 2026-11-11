import pg from "pg";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

const { Pool } = pg;

let pool = null;

const isLocalHost = (url) => /(^|@)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);

/**
 * Lazily create the Postgres pool. The classroom routes return a clear 503 when
 * no database is configured, so the existing demo can still run without one.
 */
export function getPool() {
  if (!config.databaseUrl) {
    throw new AppError(503, "The classroom database is not configured. Set DATABASE_URL.");
  }

  if (!pool) {
    const ssl =
      config.databaseSsl !== undefined
        ? config.databaseSsl
          ? { rejectUnauthorized: false }
          : false
        : isLocalHost(config.databaseUrl)
          ? false
          : { rejectUnauthorized: false };

    pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      ssl,
    });

    pool.on("error", (error) => {
      console.error("[MASTERY] Postgres pool error:", error);
    });
  }

  return pool;
}

export function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withTransaction(run) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

export const databaseConfigured = () => Boolean(config.databaseUrl);
