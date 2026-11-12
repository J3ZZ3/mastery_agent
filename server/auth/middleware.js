import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { databaseConfigured } from "../db/postgres.js";
import { expireCookie, readCookie, writeCookie } from "./cookies.js";
import { hashSessionToken } from "./tokens.js";
import { findAuthSession, touchAuthSession } from "./sessionStore.js";

export const SESSION_COOKIE = "mastery_session";

export function setSessionCookie(res, token, { maxAgeMs }) {
  writeCookie(res, SESSION_COOKIE, token, {
    maxAgeMs,
    secure: config.sessionCookieSecure,
  });
}

export function clearSessionCookie(res) {
  expireCookie(res, SESSION_COOKIE, { secure: config.sessionCookieSecure });
}

/**
 * Resolve the session cookie into req.auth. Never fails the request: demo
 * routes keep working when no database is configured, and protected routes
 * return 401/503 themselves.
 */
export async function attachAuth(req, res, next) {
  req.auth = null;

  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return next();

  if (!databaseConfigured()) return next();

  try {
    const principal = await findAuthSession(hashSessionToken(token));
    if (!principal) {
      clearSessionCookie(res);
      return next();
    }

    req.auth = principal;
    touchAuthSession(principal.sessionId).catch(() => {});
  } catch (error) {
    console.error("[MASTERY] Could not resolve session:", error.message);
  }

  return next();
}

export function requireTeacher(req, _res, next) {
  if (!databaseConfigured()) {
    return next(new AppError(503, "The classroom database is not configured."));
  }
  if (!req.auth) return next(new AppError(401, "Teacher sign-in required."));
  if (req.auth.role !== "teacher") {
    return next(new AppError(403, "A teacher account is required for this action."));
  }
  if (config.requireTeacherEmailVerification && !req.auth.teacher?.emailVerified) {
    return next(
      new AppError(
        403,
        "Verify your email address before managing classes. Check your inbox for the verification link.",
      ),
    );
  }
  return next();
}

export function requireStudent(req, _res, next) {
  if (!databaseConfigured()) {
    return next(new AppError(503, "The classroom database is not configured."));
  }
  if (!req.auth) return next(new AppError(401, "Student sign-in required."));
  if (req.auth.role !== "student") {
    return next(new AppError(403, "A student account is required for this action."));
  }
  return next();
}
