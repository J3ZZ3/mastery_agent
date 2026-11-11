import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./postgres.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");

/**
 * Apply every pending SQL migration exactly once. Runs inside a transaction
 * with an advisory lock so two Render instances cannot race on deploy.
 */
export async function migrate({ silent = false } = {}) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtext('mastery_schema_migrations')::bigint)");

    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query(
        "select 1 from schema_migrations where version = $1",
        [file],
      );
      if (rowCount) continue;

      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [file]);

      if (!silent) console.log(`[MASTERY] Applied migration ${file}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  migrate()
    .then(() => closePool())
    .catch((error) => {
      console.error("[MASTERY] Migration failed:", error);
      process.exitCode = 1;
    });
}
