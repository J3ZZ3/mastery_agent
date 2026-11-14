import { Router } from "express";
import { AppError } from "../lib/errors.js";
import { asyncRoute } from "../lib/asyncRoute.js";
import { providerStatus } from "../providers/index.js";
import { config } from "../config.js";
import { databaseConfigured } from "../db/postgres.js";
import { authRouter } from "./auth.js";
import { classesRouter, studentRouter } from "./classes.js";
import { requireTeacher } from "../auth/middleware.js";
import {
  getResourceOutline,
  getResourcePages,
  getTeacherPlan,
  saveTeacherResource,
} from "../services/planService.js";
import {
  getAgentRun,
  listAgentRuns,
  startAgentRun,
} from "../services/agentRunService.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/classes", classesRouter);
apiRouter.use("/student", studentRouter);

apiRouter.get(
  "/health",
  asyncRoute(async (_req, res) => {
    res.json({
      status: "ok",
      app: "MASTERY",
      provider: providerStatus(),
      database: databaseConfigured() ? "postgres" : "not-configured",
      threshold: config.masteryThreshold,
      maxAttempts: config.maxAttempts,
      time: new Date().toISOString(),
    });
  }),
);

/**
 * Resource status for the signed-in teacher. Scoped to the authenticated teacher.
 */
apiRouter.get(
  "/plan/info",
  requireTeacher,
  asyncRoute(async (req, res) => {
    res.json(await getTeacherPlan(req.auth.teacher.id));
  }),
);

/**
 * Upload a learner book or teacher's guide. The file arrives as a raw body
 * (application/octet-stream) with the original filename in x-filename.
 */
apiRouter.post(
  "/plan/resources/:slot",
  requireTeacher,
  asyncRoute(async (req, res) => {
    const { slot } = req.params;
    if (slot !== "student-book" && slot !== "teachers-guide") {
      throw new AppError(400, "Unknown resource slot.");
    }

    const filename = req.get("x-filename") || "resource";
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const resources = await saveTeacherResource(req.auth.teacher.id, slot, {
      filename,
      buffer,
    });
    res.status(201).json(resources);
  }),
);

/** The detected topic/subtopic outline, with PDF page numbers. */
apiRouter.get(
  "/plan/resources/:slot/outline",
  requireTeacher,
  asyncRoute(async (req, res) => {
    res.json(await getResourceOutline(req.auth.teacher.id, req.params.slot));
  }),
);

/** Extracted page text, for grounded answers and for checking extraction. */
apiRouter.get(
  "/plan/resources/:slot/pages",
  requireTeacher,
  asyncRoute(async (req, res) => {
    const from = Number(req.query.from) || 1;
    const to = req.query.to === undefined ? null : Number(req.query.to);
    res.json(
      await getResourcePages(req.auth.teacher.id, req.params.slot, { from, to }),
    );
  }),
);

/**
 * Start the multi-agent analysis of an uploaded document. The run is created
 * immediately and executed in the background; poll the run endpoint to watch
 * each agent's thoughts, tool calls and handoffs.
 */
apiRouter.post(
  "/plan/resources/:slot/analyze",
  requireTeacher,
  asyncRoute(async (req, res) => {
    const { slot } = req.params;
    if (slot !== "student-book" && slot !== "teachers-guide") {
      throw new AppError(400, "Unknown resource slot.");
    }
    const run = await startAgentRun(
      req.auth.teacher.id,
      slot,
      req.body?.goal || null,
    );
    res.status(202).json(run);
  }),
);

/** Recent agent runs for this teacher. */
apiRouter.get(
  "/plan/agent-runs",
  requireTeacher,
  asyncRoute(async (req, res) => {
    res.json({
      runs: await listAgentRuns(req.auth.teacher.id, req.query.limit),
    });
  }),
);

/** One agent run, including its live trace and final result. */
apiRouter.get(
  "/plan/agent-runs/:runId",
  requireTeacher,
  asyncRoute(async (req, res) => {
    res.json(await getAgentRun(req.auth.teacher.id, req.params.runId));
  }),
);
