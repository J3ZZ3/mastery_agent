import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-classroom-test-"));
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
const teacherEmail = `teacher-${suffix}@example.com`;
const secondTeacherEmail = `teacher2-${suffix}@example.com`;
const createdEmails = [teacherEmail, secondTeacherEmail];

let teacherCookie;
let secondTeacherCookie;
let classId;
let joinCode;
let studentId;
let studentPin;
let studentCookie;

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

test("teacher can sign up, read their session, and cannot reuse an email", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Test Teacher", password: "correct horse battery" },
  });

  assert.equal(signup.status, 201);
  assert.ok(signup.cookie, "signup should set a session cookie");
  assert.equal(signup.body.teacher.email, teacherEmail);
  assert.equal(signup.body.teacher.passwordHash, undefined);
  teacherCookie = signup.cookie;

  const me = await request("/auth/me", { cookie: teacherCookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.role, "teacher");
  assert.equal(me.body.teacher.email, teacherEmail);

  const duplicate = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail.toUpperCase(), name: "Someone Else", password: "another password" },
  });
  assert.equal(duplicate.status, 409);
});

test("teacher sign-in rejects a wrong password and accepts the right one", { skip }, async () => {
  const wrong = await request("/auth/teacher/login", {
    method: "POST",
    body: { email: teacherEmail, password: "not-the-password" },
  });
  assert.equal(wrong.status, 401);

  const login = await request("/auth/teacher/login", {
    method: "POST",
    body: { email: teacherEmail, password: "correct horse battery" },
  });
  assert.equal(login.status, 200);
  assert.ok(login.cookie);
  teacherCookie = login.cookie;
});

test("teacher can create and list a class with a join code", { skip }, async () => {
  const created = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "Grade 9 Maths A",
      subject: "Mathematics",
      grade: 9,
      consentAttested: true,
    },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.class.name, "Grade 9 Maths A");
  assert.match(created.body.class.joinCode, /^[A-Z0-9]{6}$/);

  classId = created.body.class.id;
  joinCode = created.body.class.joinCode;

  const listed = await request("/classes", { cookie: teacherCookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.classes.length, 1);
  assert.equal(listed.body.classes[0].id, classId);
  assert.equal(listed.body.classes[0].studentCount, 0);
});

test("teacher can add a student and receives a one-time PIN", { skip }, async () => {
  const created = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Thabo Mokoena" },
  });

  assert.equal(created.status, 201);
  assert.match(created.body.pin, /^\d{4}$/);
  assert.equal(created.body.student.displayName, "Thabo Mokoena");
  assert.equal(created.body.student.pinHash, undefined);

  studentId = created.body.student.id;
  studentPin = created.body.pin;

  const duplicate = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "thabo mokoena" },
  });
  assert.equal(duplicate.status, 409);

  const listed = await request(`/classes/${classId}/students`, { cookie: teacherCookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.students.length, 1);
  assert.equal(listed.body.students[0].pin, undefined);
  assert.equal(listed.body.students[0].pinHash, undefined);
});

test("student signs in with class code, name and PIN", { skip }, async () => {
  const wrong = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: "Thabo Mokoena", pin: studentPin === "0000" ? "1111" : "0000" },
  });
  assert.equal(wrong.status, 401);

  const login = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode: joinCode.toLowerCase(), displayName: " thabo   mokoena ", pin: studentPin },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.student.id, studentId);
  assert.equal(login.body.class.id, classId);
  assert.ok(login.cookie);
  studentCookie = login.cookie;

  const current = await request("/student/class", { cookie: studentCookie });
  assert.equal(current.status, 200);
  assert.equal(current.body.class.joinCode, joinCode);
  assert.equal(current.body.student.displayName, "Thabo Mokoena");
});

test("roles are enforced on both sides", { skip }, async () => {
  const anonymous = await request("/classes");
  assert.equal(anonymous.status, 401);

  const studentOnTeacherRoute = await request("/classes", { cookie: studentCookie });
  assert.equal(studentOnTeacherRoute.status, 403);

  const teacherOnStudentRoute = await request("/student/class", { cookie: teacherCookie });
  assert.equal(teacherOnStudentRoute.status, 403);
});

test("one teacher cannot read or modify another teacher's class", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: secondTeacherEmail, name: "Other Teacher", password: "another password" },
  });
  assert.equal(signup.status, 201);
  secondTeacherCookie = signup.cookie;

  const list = await request("/classes", { cookie: secondTeacherCookie });
  assert.equal(list.status, 200);
  assert.equal(list.body.classes.length, 0);

  const read = await request(`/classes/${classId}`, { cookie: secondTeacherCookie });
  assert.equal(read.status, 404);

  const roster = await request(`/classes/${classId}/students`, { cookie: secondTeacherCookie });
  assert.equal(roster.status, 404);

  const add = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: secondTeacherCookie,
    body: { displayName: "Intruder" },
  });
  assert.equal(add.status, 404);
});

test("resetting a PIN invalidates the old one", { skip }, async () => {
  const reset = await request(`/classes/${classId}/students/${studentId}/pin`, {
    method: "POST",
    cookie: teacherCookie,
  });
  assert.equal(reset.status, 200);
  assert.match(reset.body.pin, /^\d{4}$/);
  const newPin = reset.body.pin;

  if (newPin !== studentPin) {
    const oldPin = await request("/auth/student/login", {
      method: "POST",
      body: { joinCode, displayName: "Thabo Mokoena", pin: studentPin },
    });
    assert.equal(oldPin.status, 401);
  }

  const login = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: "Thabo Mokoena", pin: newPin },
  });
  assert.equal(login.status, 200);
});
