import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes/index.js";
import { config } from "./config.js";
import { attachAuth } from "./auth/middleware.js";
import { requireTrustedOrigin } from "./lib/originGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "..", "dist");

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(config.corsOrigins);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (config.nodeEnv === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use("/api", (_req, res, next) => {
    // API responses can contain personal classroom data; never let a shared
    // cache or browser history store them.
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", requireTrustedOrigin);
  app.use("/api", attachAuth);
  app.use("/api", apiRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({
        app: "MASTERY",
        message: "API is running. Start the Vite client with `npm run dev` or build with `npm run build`.",
      });
    });
  }

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) {
      console.error("[MASTERY] Unhandled server error:", error);
    }
    res.status(status).json({
      error: status >= 500 ? "Unexpected server error." : error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  });

  return app;
}
