import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-pilot-safety-test-"));
process.env.MASTERY_DATA_DIR = testDataDir;

const hasDatabase = Boolean(process.env.DATABASE_URL);
const skip = hasDatabase ? false : "DATABASE_URL is not set; skipping Postgres classroom tests.";

const { createApp } = await import("../server/app.js");
const { migrate } = await import("../server/db/migrate.js");
const { closePool, query } = await import("../server/db/postgres.js");

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api`;
const sameOrigin = `http://127.0.0.1:${port}`;

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

const request = async (pathname, { method = "GET", body, cookie, origin } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;

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

  return {
    status: response.status,
    body: payload,
    cookie: readSessionCookie(response),
    headers: response.headers,
  };
};

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `safety-teacher-${suffix}@example.com`;
const otherTeacherEmail = `safety-other-${suffix}@example.com`;
const createdEmails = [teacherEmail, otherTeacherEmail];

let teacherCookie;
let otherTeacherCookie;
let classId;
let joinCode;
let student;
let studentCookie;
let sessionId;

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

test("a class cannot be created without explicit consent attestation", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Safety Teacher", password: "correct horse battery" },
  });
  assert.equal(signup.status, 201);
  teacherCookie = signup.cookie;

  const missing = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: { name: "No Consent Class", subject: "Mathematics", grade: 9 },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "Invalid class request.");

  const refused = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "No Consent Class",
      subject: "Mathematics",
      grade: 9,
      consentAttested: false,
    },
  });
  assert.equal(refused.status, 400);

  const created = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "Pilot Safety Class",
      subject: "Mathematics",
      grade: 9,
      consentAttested: true,
    },
  });
  assert.equal(created.status, 201);
  assert.ok(created.body.class.consentAttestedAt, "consent timestamp should be stored");
  classId = created.body.class.id;
  joinCode = created.body.class.joinCode;

  const listed = await request("/classes", { cookie: teacherCookie });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.classes[0].consentAttestedAt);
});

test("untrusted browser origins are blocked on unsafe methods", { skip }, async () => {
  const blocked = await request("/auth/teacher/login", {
    method: "POST",
    origin: "https://evil.example",
    body: { email: teacherEmail, password: "correct horse battery" },
  });
  assert.equal(blocked.status, 403);

  const allowed = await request("/auth/teacher/login", {
    method: "POST",
    origin: sameOrigin,
    body: { email: teacherEmail, password: "correct horse battery" },
  });
  assert.equal(allowed.status, 200);

  // Safe methods are never blocked, and requests without an Origin are allowed
  // for server-to-server clients and the test suite.
  const health = await request("/health", { origin: "https://evil.example" });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
});

test("a roster and a student session exist for the erasure tests", { skip }, async () => {
  const created = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Naledi Mokoena" },
  });
  assert.equal(created.status, 201);
  student = { ...created.body.student, pin: created.body.pin };

  const login = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: student.displayName, pin: student.pin },
  });
  assert.equal(login.status, 200);
  studentCookie = login.cookie;

  const started = await request("/student/sessions", {
    method: "POST",
    cookie: studentCookie,
    body: {},
  });
  assert.equal(started.status, 201);
  sessionId = started.body.session.id;
});

test("rotating the join code invalidates the old code", { skip }, async () => {
  const rotated = await request(`/classes/${classId}/join-code`, {
    method: "POST",
    cookie: teacherCookie,
  });
  assert.equal(rotated.status, 200);
  assert.match(rotated.body.class.joinCode, /^[A-Z0-9]{6}$/);
  assert.notEqual(rotated.body.class.joinCode, joinCode);

  const oldCode = joinCode;
  joinCode = rotated.body.class.joinCode;

  const stale = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode: oldCode, displayName: student.displayName, pin: student.pin },
  });
  assert.equal(stale.status, 401);

  const fresh = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: student.displayName, pin: student.pin },
  });
  assert.equal(fresh.status, 200);
  studentCookie = fresh.cookie;

  const detail = await request(`/classes/${classId}`, { cookie: teacherCookie });
  assert.equal(detail.body.class.joinCode, joinCode);
});

test("another teacher cannot rotate, erase or delete the class", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: otherTeacherEmail, name: "Other Teacher", password: "correct horse battery" },
  });
  assert.equal(signup.status, 201);
  otherTeacherCookie = signup.cookie;

  const rotate = await request(`/classes/${classId}/join-code`, {
    method: "POST",
    cookie: otherTeacherCookie,
  });
  assert.equal(rotate.status, 404);

  const erase = await request(`/classes/${classId}/students/${student.id}/history`, {
    method: "DELETE",
    cookie: otherTeacherCookie,
  });
  assert.equal(erase.status, 404);

  const remove = await request(`/classes/${classId}/permanent`, {
    method: "DELETE",
    cookie: otherTeacherCookie,
    body: { confirm: true },
  });
  assert.equal(remove.status, 404);
});

test("a teacher can erase one student's learning history", { skip }, async () => {
  const before = await request(`/classes/${classId}/students/${student.id}/progress`, {
    cookie: teacherCookie,
  });
  assert.equal(before.status, 200);
  assert.equal(before.body.currentSession.id, sessionId);

  const erased = await request(`/classes/${classId}/students/${student.id}/history`, {
    method: "DELETE",
    cookie: teacherCookie,
  });
  assert.equal(erased.status, 200);
  assert.equal(erased.body.deletedSessions, 1);

  const after = await request(`/classes/${classId}/students/${student.id}/progress`, {
    cookie: teacherCookie,
  });
  assert.equal(after.status, 200);
  assert.equal(after.body.currentSession, null);
  assert.deepEqual(after.body.sessions, []);

  const roster = await request(`/classes/${classId}/students`, { cookie: teacherCookie });
  assert.equal(roster.body.students.length, 1, "the student stays on the roster");

  const studentProgress = await request("/student/sessions", { cookie: studentCookie });
  assert.equal(studentProgress.status, 200);
  assert.equal(studentProgress.body.currentSession, null);
  assert.equal(studentProgress.body.learner.status, "not_started");
});

test("permanent class deletion erases the roster, sessions and access", { skip }, async () => {
  const started = await request("/student/sessions", {
    method: "POST",
    cookie: studentCookie,
    body: {},
  });
  assert.equal(started.status, 201);
  const activeSessionId = started.body.session.id;

  const unconfirmed = await request(`/classes/${classId}/permanent`, {
    method: "DELETE",
    cookie: teacherCookie,
    body: { confirm: false },
  });
  assert.equal(unconfirmed.status, 400);

  const deleted = await request(`/classes/${classId}/permanent`, {
    method: "DELETE",
    cookie: teacherCookie,
    body: { confirm: true },
  });
  assert.equal(deleted.status, 204);

  const missing = await request(`/classes/${classId}`, { cookie: teacherCookie });
  assert.equal(missing.status, 404);

  const login = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: student.displayName, pin: student.pin },
  });
  assert.equal(login.status, 401);

  const studentAccess = await request("/student/class", { cookie: studentCookie });
  assert.equal(studentAccess.status, 401);

  const counts = await query(
    `select
       (select count(*)::int from students where id = $1) as students,
       (select count(*)::int from learning_sessions where id = $2) as sessions,
       (select count(*)::int from classes where id = $3) as classes`,
    [student.id, activeSessionId, classId],
  );
  assert.deepEqual(counts.rows[0], { students: 0, sessions: 0, classes: 0 });
});
