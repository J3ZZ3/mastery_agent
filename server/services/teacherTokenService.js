import { createHash, randomBytes } from "node:crypto";
import { query } from "../db/postgres.js";
import { newId } from "../lib/id.js";

/**
 * Teacher tokens are single-use, high-entropy strings. Only a SHA-256 hash is
 * stored, so a database leak cannot be replayed as a reset or verification
 * link. Consuming a token marks it used in the same statement that validates
 * it, which makes concurrent reuse fail safely.
 */

export const TOKEN_PURPOSES = {
  passwordReset: "password_reset",
  emailVerification: "email_verification",
};

const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

export async function createTeacherToken(teacherId, purpose, ttlMs) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await query(
    `insert into teacher_tokens (id, teacher_id, purpose, token_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [newId("ttk"), teacherId, purpose, hashToken(token), expiresAt],
  );

  return token;
}

/**
 * Return the teacher id for a valid token and mark it used. Returns null when
 * the token is unknown, expired, already used, or for a different purpose.
 */
export async function consumeTeacherToken(token, purpose) {
  const { rows } = await query(
    `update teacher_tokens
     set used_at = now()
     where token_hash = $1
       and purpose = $2
       and used_at is null
       and expires_at > now()
     returning teacher_id`,
    [hashToken(token), purpose],
  );

  return rows[0]?.teacher_id ?? null;
}

export async function invalidateTeacherTokens(teacherId, purpose) {
  await query(
    `delete from teacher_tokens
     where teacher_id = $1 and purpose = $2 and used_at is null`,
    [teacherId, purpose],
  );
}

export async function deleteExpiredTeacherTokens() {
  await query("delete from teacher_tokens where expires_at <= now()");
}
