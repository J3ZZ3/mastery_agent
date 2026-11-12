import { Router } from "express";
import { config } from "../config.js";
import { asyncRoute } from "../lib/asyncRoute.js";
import { AppError } from "../lib/errors.js";
import { parseBody } from "../lib/parseBody.js";
import { secureCompare } from "../lib/secureCompare.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { requireTeacher } from "../auth/middleware.js";
import { requestSchemas } from "../validation/schemas.js";
import { getTeacherPlan, requestUpgrade, setTeacherPlanByEmail } from "../services/planService.js";

export const billingRouter = Router();

/**
 * Provider-agnostic activation endpoint. A payment provider (or an operator
 * script) calls this with the shared secret after a successful checkout or a
 * cancellation. It is deliberately not cookie-authenticated.
 */
billingRouter.post(
  "/webhook",
  asyncRoute(async (req, res) => {
    if (!config.billingWebhookSecret) {
      throw new AppError(503, "The billing webhook is not configured.");
    }

    const provided = req.get("x-mastery-billing-secret") || "";
    if (!secureCompare(provided, config.billingWebhookSecret)) {
      throw new AppError(401, "Invalid billing webhook secret.");
    }

    const body = parseBody(requestSchemas.billingWebhook, req.body, "billing webhook");
    const teacher = await setTeacherPlanByEmail(body);
    res.json({ ok: true, teacher });
  }),
);

billingRouter.use(requireTeacher);

const upgradeLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });

billingRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json({ billing: await getTeacherPlan(req.auth.teacher.id) });
  }),
);

billingRouter.post(
  "/upgrade-request",
  upgradeLimiter,
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.upgradeRequest, req.body ?? {}, "upgrade request");
    const billing = await requestUpgrade(req.auth.teacher.id, body.note);
    res.json({ ok: true, billing });
  }),
);
