import { Router } from "express";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { asyncRoute } from "../lib/asyncRoute.js";
import { parseBody } from "../lib/parseBody.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { requestSchemas } from "../validation/schemas.js";
import { readCookie } from "../auth/cookies.js";
import { createSessionToken, hashSessionToken } from "../auth/tokens.js";
import {
  clearSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "../auth/middleware.js";
import {
  createAuthSession,
  deleteAuthSession,
  deleteExpiredAuthSessions,
} from "../auth/sessionStore.js";
import {
  authenticateStudent,
  authenticateTeacher,
  signupTeacher,
} from "../services/classroomService.js";

export const authRouter = Router();

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

async function startSession(res, { role, teacherId = null, studentId = null }) {
  const token = createSessionToken();
  const maxAgeMs =
    role === "student"
      ? config.studentSessionHours * 60 * 60 * 1000
      : config.sessionTtlDays * 24 * 60 * 60 * 1000;

  await createAuthSession({
    tokenHash: hashSessionToken(token),
    role,
    teacherId,
    studentId,
    expiresAt: new Date(Date.now() + maxAgeMs).toISOString(),
  });

  setSessionCookie(res, token, { maxAgeMs });
  deleteExpiredAuthSessions().catch(() => {});
}

authRouter.post(
  "/teacher/signup",
  authLimiter,
  asyncRoute(async (req, res) => {
    if (!config.teacherSignupOpen) {
      throw new AppError(403, "Teacher signup is currently closed.");
    }

    const body = parseBody(requestSchemas.teacherSignup, req.body, "signup");
    const teacher = await signupTeacher(body);
    await startSession(res, { role: "teacher", teacherId: teacher.id });
    res.status(201).json({ teacher });
  }),
);

authRouter.post(
  "/teacher/login",
  authLimiter,
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.teacherLogin, req.body, "sign-in");
    const teacher = await authenticateTeacher(body);
    await startSession(res, { role: "teacher", teacherId: teacher.id });
    res.json({ teacher });
  }),
);

authRouter.post(
  "/student/login",
  authLimiter,
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.studentLogin, req.body, "student sign-in");
    const { student, class: classroom } = await authenticateStudent(body);
    await startSession(res, { role: "student", studentId: student.id });
    res.json({ student, class: classroom });
  }),
);

authRouter.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      await deleteAuthSession(hashSessionToken(token)).catch(() => {});
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get("/me", (req, res) => {
  if (!req.auth) {
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    role: req.auth.role,
    ...(req.auth.teacher ? { teacher: req.auth.teacher } : {}),
    ...(req.auth.student ? { student: req.auth.student } : {}),
    ...(req.auth.class ? { class: req.auth.class } : {}),
  });
});
