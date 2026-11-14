import { createApp } from "./app.js";
import { config } from "./config.js";
import { providerStatus } from "./providers/index.js";
import { closePool, databaseConfigured } from "./db/postgres.js";
import { migrate } from "./db/migrate.js";

const app = createApp();

async function start() {
  if (databaseConfigured()) {
    await migrate();
  }

  const server = app.listen(config.port, () => {
    const provider = providerStatus();
    console.log("");
    console.log("  MASTERY API");
    console.log(`  http://localhost:${config.port}/api/health`);
    console.log(`  Provider: ${provider.label}`);
    console.log(`  Mastery threshold: ${config.masteryThreshold}% · Max attempts: ${config.maxAttempts}`);
    console.log(`  Classroom database: ${databaseConfigured() ? "postgres" : "not configured"}`);
    console.log("");
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[MASTERY] ${signal} received. Draining requests...`);

    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });

    // Never hang a deploy if a connection refuses to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  console.error("[MASTERY] Failed to start server:", error);
  process.exit(1);
});
