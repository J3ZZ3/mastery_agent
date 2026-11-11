import { AppError } from "./errors.js";

/**
 * Small in-memory fixed-window limiter. This is enough for a single-instance
 * pilot; move it to Redis before running multiple API instances.
 */
export function createRateLimiter({ windowMs = 60_000, max = 30, key } = {}) {
  const buckets = new Map();
  const bucketKey = key || ((req) => `${req.ip}:${req.path}`);

  return (req, res, next) => {
    const now = Date.now();

    if (buckets.size > 10_000) {
      for (const [id, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(id);
      }
    }

    const id = bucketKey(req);
    const entry = buckets.get(id);

    if (!entry || entry.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return next(new AppError(429, "Too many attempts. Please wait a moment and try again."));
    }

    return next();
  };
}
