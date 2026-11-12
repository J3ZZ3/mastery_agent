import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-learning-test-"));
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
const teacherEmail = `learning-teacher-${suffix}@example.com`;
const createdEmails = [teacherEmail];

let teacherCookie;
let classId;
let joinCode;
let studentA;
let studentB;
let studentACookie;
let studentBCookie;
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

test("a class is created with two students for the learning-cycle tests", { skip }, async () => {
  const signup = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Learning Teacher", password: "correct horse battery" },
  });
  assert.equal(signup.status, 201);
  teacherCookie = signup.cookie;

  const created = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      name: "Learning Test Class",
      subject: "Mathematics",
      grade: 9,
      consentAttested: true,
    },
  });
  assert.equal(created.status, 201);
  classId = created.body.class.id;
  joinCode = created.body.class.joinCode;

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

  const loginB = await request("/auth/student/login", {
    method: "POST",
    body: { joinCode, displayName: studentB.displayName, pin: studentB.pin },
  });
  assert.equal(loginB.status, 200);
  studentBCookie = loginB.cookie;
});

test("a student starts and resumes their own classroom session", { skip }, async () => {
  const started = await request("/student/sessions", {
    method: "POST",
    cookie: studentACookie,
    body: {},
  });

  assert.equal(started.status, 201);
  assert.equal(started.body.resumed, false);
  assert.equal(started.body.session.status, "diagnostic");
  assert.equal(started.body.session.learnerId, studentA.id);
  assert.equal(started.body.learner.id, studentA.id);
  assert.equal(started.body.learner.name, studentA.displayName);
  assert.equal(started.body.learner.status, "diagnostic");

  // Classroom learners are not demo learners, so no answer hints are sent.
  assert.equal(started.body.session.diagnostic.questions[0].demoAnswer, undefined);

  sessionId = started.body.session.id;

  const resumed = await request("/student/sessions", {
    method: "POST",
    cookie: studentACookie,
    body: {},
  });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.session.id, sessionId);

  const progress = await request("/student/sessions", { cookie: studentACookie });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.learner.id, studentA.id);
  assert.equal(progress.body.learner.activeSessionId, sessionId);
  assert.equal(progress.body.currentSession.id, sessionId);
});

test("another student cannot read or drive someone else's session", { skip }, async () => {
  const progress = await request("/student/sessions", { cookie: studentBCookie });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.currentSession, null);
  assert.equal(progress.body.learner.status, "not_started");

  const read = await request(`/student/sessions/${sessionId}`, { cookie: studentBCookie });
  assert.equal(read.status, 404);

  const diagnostic = await request(`/student/sessions/${sessionId}/diagnostic`, {
    method: "POST",
    cookie: studentBCookie,
    body: { answers: { d1: "-5", d2: "3", d3: "7", d4: "6", d5: "8" } },
  });
  assert.equal(diagnostic.status, 404);

  const practice = await request(`/student/sessions/${sessionId}/practice`, {
    method: "POST",
    cookie: studentBCookie,
    body: { answers: { p1a1: "-2", p1a2: "10", p1a3: "12" } },
  });
  assert.equal(practice.status, 404);

  const teacherOnStudentRoute = await request("/student/sessions", { cookie: teacherCookie });
  assert.equal(teacherOnStudentRoute.status, 403);

  const anonymous = await request("/student/sessions");
  assert.equal(anonymous.status, 401);
});

test("a classroom student completes the full six-agent cycle", { skip }, async () => {
  const diagnostic = await request(`/student/sessions/${sessionId}/diagnostic`, {
    method: "POST",
    cookie: studentACookie,
    body: { answers: { d1: "-1", d2: "3", d3: "3", d4: "6", d5: "3" } },
  });

  assert.equal(diagnostic.status, 200);
  assert.equal(diagnostic.body.session.status, "learning");
  assert.equal(diagnostic.body.session.diagnosis.gapKey, "negative_operations");
  assert.equal(diagnostic.body.session.diagnostic.report.correctAnswers, 2);
  assert.equal(diagnostic.body.session.attempts.length, 1);

  const check = await request(`/student/sessions/${sessionId}/practice/check`, {
    method: "POST",
    cookie: studentACookie,
    body: { questionId: "p1a1", answer: "-2" },
  });
  assert.equal(check.status, 200);
  assert.equal(check.body.check.correct, true);

  const practice = await request(`/student/sessions/${sessionId}/practice`, {
    method: "POST",
    cookie: studentACookie,
    body: { answers: { p1a1: "-2", p1a2: "10", p1a3: "12" } },
  });
  assert.equal(practice.status, 200);
  assert.equal(practice.body.session.status, "mastery");
  assert.equal(practice.body.session.attempts[0].mastery.questions.length, 5);
  // Mastery answer keys stay server-side for classroom learners.
  assert.equal(practice.body.session.attempts[0].mastery.questions[0].demoAnswer, undefined);

  const mastery = await request(`/student/sessions/${sessionId}/mastery`, {
    method: "POST",
    cookie: studentACookie,
    body: { answers: { m1a: "-3", m1b: "-4", m1c: "8", m1d: "8", m1e: "2" } },
  });
  assert.equal(mastery.status, 200);
  assert.equal(mastery.body.session.status, "complete");
  assert.equal(mastery.body.session.attempts[0].mastery.result.thresholdMet, true);
  assert.ok(mastery.body.session.teacherInsight?.headline);

  const progress = await request("/student/sessions", { cookie: studentACookie });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.learner.status, "complete_pass");
  assert.equal(progress.body.learner.completedCycles, 1);
  assert.equal(progress.body.currentSession.id, sessionId);
});

test("a student can restart and abandon an active cycle", { skip }, async () => {
  const started = await request("/student/sessions", {
    method: "POST",
    cookie: studentBCookie,
    body: {},
  });
  assert.equal(started.status, 201);
  const firstId = started.body.session.id;

  const restarted = await request("/student/sessions", {
    method: "POST",
    cookie: studentBCookie,
    body: { restart: true },
  });
  assert.equal(restarted.status, 201);
  assert.notEqual(restarted.body.session.id, firstId);
  assert.equal(restarted.body.session.status, "diagnostic");

  const old = await request(`/student/sessions/${firstId}`, { cookie: studentBCookie });
  assert.equal(old.status, 200);
  assert.equal(old.body.session.status, "abandoned");
});

test("sessions are stored in Postgres against the class and student", { skip }, async () => {
  const { rows } = await query(
    `select class_id, student_id, status
     from learning_sessions
     where id = $1`,
    [sessionId],
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].class_id, classId);
  assert.equal(rows[0].student_id, studentA.id);
  assert.equal(rows[0].status, "complete");
});
