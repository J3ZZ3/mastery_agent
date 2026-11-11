import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

/**
 * Hash a teacher password or student PIN with scrypt.
 * Stored as scrypt$N$r$p$salt$hash so parameters can be raised later without
 * invalidating existing credentials.
 */
export async function hashSecret(secret) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(String(secret), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, derived.toString("hex")].join("$");
}

export async function verifySecret(secret, stored) {
  if (typeof stored !== "string") return false;

  const [scheme, n, r, p, salt, expectedHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length === 0) return false;

  let derived;
  try {
    derived = await scrypt(String(secret), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** A 4-digit PIN with a leading zero allowed, e.g. "0042". */
export const generatePin = () => String(randomInt(0, 10_000)).padStart(4, "0");
