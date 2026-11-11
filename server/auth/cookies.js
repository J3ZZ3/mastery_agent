/** Minimal cookie helpers so the app does not need cookie-parser. */

export function readCookie(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return null;
}

export function writeCookie(res, name, value, { maxAgeMs, secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof maxAgeMs === "number") {
    parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  }
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function expireCookie(res, name, { secure = false } = {}) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}
