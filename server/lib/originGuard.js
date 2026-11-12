import { config } from "../config.js";
import { AppError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Reject state-changing API requests that come from an untrusted browser
 * origin. The session cookie is SameSite=Lax, so this is defence in depth for
 * older browsers, proxies and any future cookie-policy change.
 *
 * Requests without an Origin header (server-to-server, curl, tests) are
 * allowed; browsers always send Origin on cross-origin unsafe requests.
 */
export function requireTrustedOrigin(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (!origin) return next();

  const allowed = new Set([...config.corsOrigins, config.clientOrigin]);
  const host = req.get("host");
  if (host) allowed.add(`${req.protocol}://${host}`);

  if (allowed.has(origin)) return next();

  return next(new AppError(403, "Request blocked: untrusted origin."));
}
