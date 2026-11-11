import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-progress-test-"));
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
const teacherEmail = `progress-teacher-${suffix}@example.com`;
const otherTeacherEmail = `progress-other-${suffix}@example.com`;
const createdEmails = [teacherEmail, otherTeacherEmail];

let teacherCookie;
let otherTeacherCookie;
let classId;
let otherClassId;
let studentA;
let studentB;
let studentACookie;
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

test("a class and roster exist for the progress tests", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Progress Teacher", password: "correct horse battery" },
  });
  assert.equal(signup.status, 201);
  teacherCookie = signup.cookie;

  const created = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: { name: "Progress Test Class", subject: "Mathematics", grade: 9 },
  });
  assert.equal(created.status, 201);
  classId = created.body.class.id;
  const joinCode = created.body.class.joinCode;

  const first = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Ayanda Ndlovu" },
  });
  assert.equal(first.status, 201);
  studentA = { ...first.body.student, pin: first.body.pin };

  const second = await request(`/classes/${classId}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Bongani Khumalo" },
  });
  assert.equal(second.status, 201);
  studentB = { ...second.body.student, pin: second.body.pin };

  const loginA = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: studentA.displayName, pin: studentA.pin },
  });
  assert.equal(loginA.status, 200);
  studentACookie = loginA.cookie;

  // A second teacher with their own class, to prove cross-tenant isolation.
  const otherSignup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: otherTeacherEmail, name: "Other Teacher", password: "correct horse battery" },
  });
  assert.equal(otherSignup.status, 201);
  otherTeacherCookie = otherSignup.cookie;

  const otherClass = await request("/classes", {
    method: "POST",
    cookie: otherTeacherCookie,
    body: { name: "Other Class", subject: "Mathematics", grade: 9 },
  });
  assert.equal(otherClass.status, 201);
  otherClassId = otherClass.body.class.id;
});

test("class progress starts empty and lists the roster", { skip }, async () => {
  const progress = await request(`/classes/${classId}/progress`, { cookie: teacherCookie });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.class.id, classId);
  assert.equal(progress.body.stats.totalStudents, 2);
  assert.equal(progress.body.stats.notStarted, 2);
  assert.equal(progress.body.stats.activeStudents, 0);
  assert.equal(progress.body.stats.completedCycles, 0);
  assert.equal(progress.body.stats.masteryRecovery, 0);

  const byId = new Map(progress.body.students.map((student) => [student.id, student]));
  assert.equal(byId.get(studentA.id).status, "not_started");
  assert.equal(byId.get(studentB.id).status, "not_started");
  assert.equal(byId.get(studentA.id).lastSeenAt !== undefined, true);
});

test("a student detail page has no session before the cycle starts", { skip }, async () => {
  const detail = await request(`/classes/${classId}/students/${studentA.id}/progress`, {
    cookie: teacherCookie,
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.student.id, studentA.id);
  assert.equal(detail.body.learner.status, "not_started");
  assert.equal(detail.body.currentSession, null);
  assert.deepEqual(detail.body.sessions, []);
});

test("a completed classroom cycle appears in the teacher progress view", { skip }, async () => {
  const started = await request("/student/sessions", {
    method: "POST",
    cookie: studentACookie,
    body: {},
  });
  assert.equal(started.status, 201);
  sessionId = started.body.session.id;

  const diagnostic = await request(`/student/sessions/${sessionId}/diagnostic`, {
    method: "POST",
    cookie: studentACookie,
    body: { answers: { d1: "-1", d2: "3", d3: "3", d4: "6", d5: "3" } },
  });
  assert.equal(diagnostic.status, 200);

  const practice = await request(`/student/sessions/${sessionId}/practice`, {
    method: "POST",
    cookie: studentACookie,
    body: { answers: { p1a1: "-2", p1a2: "10", p1a3: "12" } },
  });
  assert.equal(practice.status, 200);

  const mastery = await request(`/student/sessions/${sessionId}/mastery`, {
    method: "POST",
    cookie: studentACookie,
    body: { answers: { m1a: "-3", m1b: "-4", m1c: "8", m1d: "8", m1e: "2" } },
  });
  assert.equal(mastery.status, 200);
  assert.equal(mastery.body.session.status, "complete");

  const progress = await request(`/classes/${classId}/progress`, { cookie: teacherCookie });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.stats.recovered, 1);
  assert.equal(progress.body.stats.needsSupport, 0);
  assert.equal(progress.body.stats.completedCycles, 1);
  assert.equal(progress.body.stats.masteryRecovery, 100);

  const byId = new Map(progress.body.students.map((student) => [student.id, student]));
  const studentAState = byId.get(studentA.id);
  assert.equal(studentAState.status, "complete_pass");
  assert.equal(studentAState.masteryMet, true);
  assert.equal(studentAState.completedCycles, 1);
  assert.ok(studentAState.latestScore >= 80);
  assert.equal(studentAState.activeSessionId, null);
  assert.equal(byId.get(studentB.id).status, "not_started");

  const detail = await request(`/classes/${classId}/students/${studentA.id}/progress`, {
    cookie: teacherCookie,
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.learner.status, "complete_pass");
  assert.equal(detail.body.currentSession.id, sessionId);
  assert.equal(detail.body.currentSession.status, "complete");
  assert.ok(detail.body.currentSession.teacherInsight?.headline);
  assert.equal(detail.body.sessions.length, 1);
  assert.equal(detail.body.sessions[0].masteryMet, true);
  // Classroom sessions never expose answer keys to the teacher view either.
  assert.equal(detail.body.currentSession.attempts[0].mastery.questions[0].demoAnswer, undefined);
});

test("another teacher cannot read class or student progress", { skip }, async () => {
  const classProgress = await request(`/classes/${classId}/progress`, {
    cookie: otherTeacherCookie,
  });
  assert.equal(classProgress.status, 404);

  const studentProgress = await request(`/classes/${classId}/students/${studentA.id}/progress`, {
    cookie: otherTeacherCookie,
  });
  assert.equal(studentProgress.status, 404);

  // The student ID belongs to classId, so it is not reachable through another class.
  const wrongClass = await request(`/classes/${otherClassId}/students/${studentA.id}/progress`, {
    cookie: otherTeacherCookie,
  });
  assert.equal(wrongClass.status, 404);

  const anonymous = await request(`/classes/${classId}/progress`);
  assert.equal(anonymous.status, 401);

  const asStudent = await request(`/classes/${classId}/progress`, { cookie: studentACookie });
  assert.equal(asStudent.status, 403);
});
