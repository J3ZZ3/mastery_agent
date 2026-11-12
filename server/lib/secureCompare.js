import { timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets without leaking where they differ. Length differences
 * still short-circuit, which is acceptable for invite codes and webhook keys.
 */
export function secureCompare(left, right) {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
