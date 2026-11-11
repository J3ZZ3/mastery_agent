import { createHash, randomBytes } from "node:crypto";

/**
 * Session tokens are high-entropy random strings handed to the browser.
 * Only a SHA-256 hash is stored in Postgres, so a database leak cannot be
 * replayed as a valid session cookie.
 */
export const createSessionToken = () => randomBytes(32).toString("base64url");

export const hashSessionToken = (token) => createHash("sha256").update(String(token)).digest("hex");
