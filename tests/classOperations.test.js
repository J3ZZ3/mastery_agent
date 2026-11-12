import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
process.env.EMAIL_DELIVERY = "disabled";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-class-operations-test-"));
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

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `ops-teacher-${suffix}@example.com`;
const otherEmail = `ops-other-${suffix}@example.com`;
const createdEmails = [teacherEmail, otherEmail];
const password = "correct horse battery";

let teacherCookie;
let otherCookie;
let classId;
let joinCode;
let importedPin;
let importedName;

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

test("a teacher can edit a class without changing its code or roster", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Ops Teacher", password },
  });
  assert.equal(signup.status, 201);
  teacherCookie = signup.cookie;

  const created = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "Grade 9 Maths",
      subject: "Mathematics",
      grade: 9,
      consentAttested: true,
    },
  });
  assert.equal(created.status, 201);
  classId = created.body.class.id;
  joinCode = created.body.class.joinCode;

  const updated = await request(`/classes/${classId}`, {
    method: "PATCH",
    cookie: teacherCookie,
    body: { name: "Grade 9 Maths A", subject: "Mathematical Literacy", grade: 10 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.class.name, "Grade 9 Maths A");
  assert.equal(updated.body.class.subject, "Mathematical Literacy");
  assert.equal(updated.body.class.grade, 10);
  assert.equal(updated.body.class.joinCode, joinCode);
});

test("CSV import adds new students, skips duplicates and returns one-time PINs", { skip }, async () => {
  const existing = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Existing Student" },
  });
  assert.equal(existing.status, 201);

  const imported = await request(`/classes/${classId}/students/import`, {
    method: "POST",
    cookie: teacherCookie,
    body: {
      csv: [
        "name,notes",
        "Naledi Mokoena,absent on Monday",
        "Thabo Dlamini",
        "existing student",
        "Naledi Mokoena",
        "",
      ].join("\n"),
    },
  });

  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported.length, 2);
  assert.equal(imported.body.skipped.length, 2);
  assert.equal(imported.body.totalStudents, 3);

  const names = imported.body.imported.map((entry) => entry.student.displayName).sort();
  assert.deepEqual(names, ["Naledi Mokoena", "Thabo Dlamini"]);
  for (const entry of imported.body.imported) {
    assert.match(entry.pin, /^\d{4}$/);
  }

  const reasons = imported.body.skipped.map((entry) => entry.reason).sort();
  assert.ok(reasons.some((reason) => /already in this class/i.test(reason)));
  assert.ok(reasons.some((reason) => /duplicate/i.test(reason)));

  const naledi = imported.body.imported.find((entry) => entry.student.displayName === "Naledi Mokoena");
  importedPin = naledi.pin;
  importedName = naledi.student.displayName;

  const roster = await request(`/classes/${classId}/students`, { cookie: teacherCookie });
  assert.equal(roster.body.students.length, 3);
});

test("an oversized import is rejected before any student is created", { skip }, async () => {
  const names = Array.from({ length: 101 }, (_, index) => `Learner ${index + 1}`).join("\n");
  const result = await request(`/classes/${classId}/students/import`, {
    method: "POST",
    cookie: teacherCookie,
    body: { csv: names },
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /at most 100/i);

  const roster = await request(`/classes/${classId}/students`, { cookie: teacherCookie });
  assert.equal(roster.body.students.length, 3);
});

test("archiving hides a class, blocks sign-in and stops new students", { skip }, async () => {
  const archived = await request(`/classes/${classId}`, {
    method: "DELETE",
    cookie: teacherCookie,
  });
  assert.equal(archived.status, 200);
  assert.ok(archived.body.class.archivedAt);

  const active = await request("/classes", { cookie: teacherCookie });
  assert.equal(active.body.classes.length, 0);

  const archivedList = await request("/classes/archived", { cookie: teacherCookie });
  assert.equal(archivedList.body.classes.length, 1);
  assert.equal(archivedList.body.classes[0].id, classId);
  assert.equal(archivedList.body.classes[0].studentCount, 3);

  const detail = await request(`/classes/${classId}`, { cookie: teacherCookie });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.class.archivedAt);

  const login = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: importedName, pin: importedPin },
  });
  assert.equal(login.status, 401);

  const add = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Late Student" },
  });
  assert.equal(add.status, 409);

  const imported = await request(`/classes/${classId}/students/import`, {
    method: "POST",
    cookie: teacherCookie,
    body: { csv: "Another Student" },
  });
  assert.equal(imported.status, 409);
});

test("restoring a class makes it usable again", { skip }, async () => {
  const restored = await request(`/classes/${classId}/restore`, {
    method: "POST",
    cookie: teacherCookie,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.class.archivedAt, null);

  const active = await request("/classes", { cookie: teacherCookie });
  assert.equal(active.body.classes.length, 1);

  const archivedList = await request("/classes/archived", { cookie: teacherCookie });
  assert.equal(archivedList.body.classes.length, 0);

  const login = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: importedName, pin: importedPin },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.student.displayName, importedName);
});

test("another teacher cannot import into, archive or restore the class", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: otherEmail, name: "Other Ops Teacher", password },
  });
  assert.equal(signup.status, 201);
  otherCookie = signup.cookie;

  const imported = await request(`/classes/${classId}/students/import`, {
    method: "POST",
    cookie: otherCookie,
    body: { csv: "Intruder Student" },
  });
  assert.equal(imported.status, 404);

  const archived = await request(`/classes/${classId}`, {
    method: "DELETE",
    cookie: otherCookie,
  });
  assert.equal(archived.status, 404);

  const restored = await request(`/classes/${classId}/restore`, {
    method: "POST",
    cookie: otherCookie,
  });
  assert.equal(restored.status, 404);

  const otherArchived = await request("/classes/archived", { cookie: otherCookie });
  assert.equal(otherArchived.status, 200);
  assert.equal(otherArchived.body.classes.length, 0);
});
