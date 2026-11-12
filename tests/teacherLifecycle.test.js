import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
process.env.EMAIL_DELIVERY = "disabled";
process.env.REQUIRE_TEACHER_EMAIL_VERIFICATION = "true";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-teacher-lifecycle-test-"));
process.env.MASTERY_DATA_DIR = testDataDir;

const hasDatabase = Boolean(process.env.DATABASE_URL);
const skip = hasDatabase ? false : "DATABASE_URL is not set; skipping Postgres classroom tests.";

const { createApp } = await import("../server/app.js");
const { migrate } = await import("../server/db/migrate.js");
const { closePool, query } = await import("../server/db/postgres.js");
const { clearOutbox, getOutbox } = await import("../server/services/mailer.js");

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api`;

const readSessionCookie = (response) => {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  for (const value of values) {
    const first = value.split(";")[0];
    if (first.startsWith("mastery_session=")) return first;
  }
  return null;
};

const request = async (pathname, { method = "GET", body, cookie } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return { status: response.status, body: payload, cookie: readSessionCookie(response) };
};

const tokenFrom = (message, pathFragment) => {
  if (!message) return null;
  const match = message.text.match(new RegExp(`${pathFragment}\\?token=([A-Za-z0-9_-]+)`));
  return match?.[1] ?? null;
};

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `lifecycle-${suffix}@example.com`;
const unknownEmail = `nobody-${suffix}@example.com`;
const createdEmails = [teacherEmail];
const password = "correct horse battery";
const newPassword = "a brand new password";

let teacherCookie;
let verificationToken;

test.before(async () => {
  if (hasDatabase) await migrate({ silent: true });
});

test.after(async () => {
  if (hasDatabase) {
    await query("delete from teachers where lower(email) = any($1)", [createdEmails]).catch(() => {});
  }
  await new Promise((resolve) => server.close(resolve));
  await closePool().catch(() => {});
  await rm(testDataDir, { recursive: true, force: true });
});

test("signup sends a single-use verification link", { skip }, async () => {
  clearOutbox();
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Lifecycle Teacher", password },
  });

  assert.equal(signup.status, 201);
  assert.equal(signup.body.teacher.email, teacherEmail);
  assert.equal(signup.body.teacher.emailVerified, false);
  teacherCookie = signup.cookie;

  const messages = getOutbox();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, teacherEmail);
  assert.match(messages[0].subject, /verify/i);

  verificationToken = tokenFrom(messages[0], "/portal/teacher/verify-email");
  assert.ok(verificationToken, "the verification email should contain a token");
});

test("an unverified teacher cannot manage classes until the link is used", { skip }, async () => {
  const blocked = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "Unverified Class",
      subject: "Mathematics",
      grade: 9,
      consentAttested: true,
    },
  });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /verify your email/i);

  const verified = await request("/auth/teacher/verify-email", {
    method: "POST",
    body: { token: verificationToken },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.teacher.emailVerified, true);

  const reused = await request("/auth/teacher/verify-email", {
    method: "POST",
    body: { token: verificationToken },
  });
  assert.equal(reused.status, 400);

  const created = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "Verified Class",
      subject: "Mathematics",
      grade: 9,
      consentAttested: true,
    },
  });
  assert.equal(created.status, 201);

  const me = await request("/auth/me", { cookie: teacherCookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.teacher.emailVerified, true);
});

test("resending verification is a no-op once the address is verified", { skip }, async () => {
  const result = await request("/auth/teacher/resend-verification", {
    method: "POST",
    cookie: teacherCookie,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.alreadyVerified, true);
});

test("forgot-password does not reveal whether an address exists", { skip }, async () => {
  clearOutbox();

  const unknown = await request("/auth/teacher/forgot-password", {
    method: "POST",
    body: { email: unknownEmail },
  });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, { ok: true });
  assert.equal(getOutbox().length, 0, "no email is sent for an unknown address");

  const known = await request("/auth/teacher/forgot-password", {
    method: "POST",
    body: { email: teacherEmail },
  });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, { ok: true });

  const messages = getOutbox();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, teacherEmail);
  assert.match(messages[0].subject, /reset/i);

  const resetToken = tokenFrom(messages[0], "/portal/teacher/reset-password");
  assert.ok(resetToken, "the reset email should contain a token");

  // Keep the token for the next test without exposing it through module state
  // that could accidentally be asserted against.
  verificationToken = resetToken;
});

test("a reset link changes the password, signs out old sessions and cannot be reused", { skip }, async () => {
  const resetToken = verificationToken;

  const weak = await request("/auth/teacher/reset-password", {
    method: "POST",
    body: { token: resetToken, password: "short" },
  });
  assert.equal(weak.status, 400);

  const reset = await request("/auth/teacher/reset-password", {
    method: "POST",
    body: { token: resetToken, password: newPassword },
  });
  assert.equal(reset.status, 200);

  const oldSession = await request("/auth/me", { cookie: teacherCookie });
  assert.equal(oldSession.status, 200);
  assert.equal(oldSession.body.authenticated, false, "the old session was revoked");

  const oldLogin = await request("/auth/teacher/login", {
    method: "POST",
    body: { email: teacherEmail, password },
  });
  assert.equal(oldLogin.status, 401);

  const newLogin = await request("/auth/teacher/login", {
    method: "POST",
    body: { email: teacherEmail, password: newPassword },
  });
  assert.equal(newLogin.status, 200);
  assert.equal(newLogin.body.teacher.emailVerified, true);
  teacherCookie = newLogin.cookie;

  const reused = await request("/auth/teacher/reset-password", {
    method: "POST",
    body: { token: resetToken, password: "another password" },
  });
  assert.equal(reused.status, 400);
});

test("an invalid or expired token fails cleanly", { skip }, async () => {
  const reset = await request("/auth/teacher/reset-password", {
    method: "POST",
    body: { token: "not-a-real-token-but-long-enough", password: newPassword },
  });
  assert.equal(reset.status, 400);

  const verify = await request("/auth/teacher/verify-email", {
    method: "POST",
    body: { token: "not-a-real-token-but-long-enough" },
  });
  assert.equal(verify.status, 400);
});
