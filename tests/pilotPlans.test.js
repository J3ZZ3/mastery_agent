import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DELAY_MS = "0";
process.env.AI_PROVIDER = "demo";
process.env.EMAIL_DELIVERY = "disabled";
process.env.PILOT_INVITE_CODE = "pilot-2026";
process.env.PILOT_MAX_CLASSES = "2";
process.env.PILOT_MAX_STUDENTS_PER_CLASS = "3";
process.env.BILLING_WEBHOOK_SECRET = "test-billing-secret";
process.env.BILLING_CONTACT_EMAIL = "billing@example.com";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-pilot-plans-test-"));
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

const request = async (pathname, { method = "GET", body, cookie, headers = {} } = {}) => {
  const nextHeaders = { ...headers };
  if (body !== undefined) nextHeaders["Content-Type"] = "application/json";
  if (cookie) nextHeaders.Cookie = cookie;

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: nextHeaders,
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
const teacherEmail = `plans-${suffix}@example.com`;
const createdEmails = [teacherEmail];
const password = "correct horse battery";

let teacherCookie;
let firstClass;
let secondClass;
let thirdClass;
let firstStudent;

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

test("teacher signup requires the pilot invite code when configured", { skip }, async () => {
  const config = await request("/auth/config");
  assert.equal(config.status, 200);
  assert.equal(config.body.pilotInviteRequired, true);
  assert.equal(config.body.teacherSignupOpen, true);

  const missing = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Plan Teacher", password },
  });
  assert.equal(missing.status, 403);
  assert.match(missing.body.error, /invite code/i);

  const wrong = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Plan Teacher", password, inviteCode: "wrong-code" },
  });
  assert.equal(wrong.status, 403);

  const created = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Plan Teacher", password, inviteCode: "pilot-2026" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.teacher.plan, "pilot");
  assert.ok(created.body.teacher.trialEndsAt);
  teacherCookie = created.cookie;
});

test("the billing endpoint reports the pilot limits and usage", { skip }, async () => {
  const result = await request("/billing", { cookie: teacherCookie });
  assert.equal(result.status, 200);

  const { billing } = result.body;
  assert.equal(billing.plan, "pilot");
  assert.equal(billing.trialActive, true);
  assert.equal(billing.limits.maxClasses, 2);
  assert.equal(billing.limits.maxStudentsPerClass, 3);
  assert.equal(billing.usage.classes, 0);
  assert.equal(billing.usage.students, 0);
  assert.equal(billing.contactEmail, "billing@example.com");
  assert.ok(billing.trialDaysRemaining > 0);
});

test("the pilot class limit is enforced", { skip }, async () => {
  const create = (name) =>
    request("/classes", {
      method: "POST",
      cookie: teacherCookie,
      body: { name, subject: "Mathematics", grade: 9, consentAttested: true },
    });

  const one = await create("Plan Class One");
  assert.equal(one.status, 201);
  firstClass = one.body.class;

  const two = await create("Plan Class Two");
  assert.equal(two.status, 201);
  secondClass = two.body.class;

  const three = await create("Plan Class Three");
  assert.equal(three.status, 402);
  assert.match(three.body.error, /up to 2 active classes/i);

  const billing = await request("/billing", { cookie: teacherCookie });
  assert.equal(billing.body.billing.usage.classes, 2);
  assert.equal(billing.body.billing.canCreateClass, false);
});

test("the pilot per-class student limit is enforced for add and import", { skip }, async () => {
  const add = (displayName) =>
    request(`/classes/${firstClass.id}/students`, {
      method: "POST",
      cookie: teacherCookie,
      body: { displayName },
    });

  const first = await add("Plan Student One");
  assert.equal(first.status, 201);
  firstStudent = { ...first.body.student, pin: first.body.pin };

  const second = await add("Plan Student Two");
  assert.equal(second.status, 201);

  const third = await add("Plan Student Three");
  assert.equal(third.status, 201);

  const fourth = await add("Plan Student Four");
  assert.equal(fourth.status, 402);
  assert.match(fourth.body.error, /limited to 3 students/i);

  const imported = await request(`/classes/${firstClass.id}/students/import`, {
    method: "POST",
    cookie: teacherCookie,
    body: { csv: "Plan Extra One\nPlan Extra Two" },
  });
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported.length, 0);
  assert.equal(imported.body.skipped.length, 2);
  for (const skipped of imported.body.skipped) {
    assert.match(skipped.reason, /class is full/i);
  }
});

test("an upgrade request is recorded without revealing billing secrets", { skip }, async () => {
  const first = await request("/billing/upgrade-request", {
    method: "POST",
    cookie: teacherCookie,
    body: { note: "Four Grade 9 classes next term." },
  });
  assert.equal(first.status, 200);
  assert.ok(first.body.billing.upgradeRequestedAt);

  const requestedAt = first.body.billing.upgradeRequestedAt;
  const second = await request("/billing/upgrade-request", {
    method: "POST",
    cookie: teacherCookie,
    body: { note: "Still interested." },
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.billing.upgradeRequestedAt, requestedAt);
});

test("the billing webhook activates a paid plan and raises the limits", { skip }, async () => {
  const unauthorized = await request("/billing/webhook", {
    method: "POST",
    body: { email: teacherEmail, plan: "paid" },
  });
  assert.equal(unauthorized.status, 401);

  const wrongSecret = await request("/billing/webhook", {
    method: "POST",
    headers: { "x-mastery-billing-secret": "nope" },
    body: { email: teacherEmail, plan: "paid" },
  });
  assert.equal(wrongSecret.status, 401);

  const activated = await request("/billing/webhook", {
    method: "POST",
    headers: { "x-mastery-billing-secret": "test-billing-secret" },
    body: { email: teacherEmail, plan: "paid" },
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.teacher.plan, "paid");

  const billing = await request("/billing", { cookie: teacherCookie });
  assert.equal(billing.body.billing.plan, "paid");
  assert.equal(billing.body.billing.trialActive, true);
  assert.equal(billing.body.billing.limits.maxClasses, 50);
  assert.equal(billing.body.billing.limits.maxStudentsPerClass, 300);
  assert.equal(billing.body.billing.upgradeRequestedAt, null);

  const third = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: { name: "Plan Class Three", subject: "Mathematics", grade: 9, consentAttested: true },
  });
  assert.equal(third.status, 201);
  thirdClass = third.body.class;

  const fourthStudent = await request(`/classes/${firstClass.id}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Plan Student Four" },
  });
  assert.equal(fourthStudent.status, 201);
});

test("after the trial ends existing classes keep working but new capacity pauses", { skip }, async () => {
  await query(
    `update teachers
     set plan = 'pilot',
         trial_ends_at = now() - interval '1 day',
         upgrade_requested_at = null
     where lower(email) = lower($1)`,
    [teacherEmail],
  );

  const billing = await request("/billing", { cookie: teacherCookie });
  assert.equal(billing.body.billing.trialActive, false);
  assert.equal(billing.body.billing.trialDaysRemaining, 0);
  assert.equal(billing.body.billing.canCreateClass, false);

  const create = await request("/classes", {
    method: "POST",
    cookie: teacherCookie,
    body: { name: "Plan Class Four", subject: "Mathematics", grade: 9, consentAttested: true },
  });
  assert.equal(create.status, 402);
  assert.match(create.body.error, /pilot has ended/i);

  const add = await request(`/classes/${firstClass.id}/students`, {
    method: "POST",
    cookie: teacherCookie,
    body: { displayName: "Plan Student Five" },
  });
  assert.equal(add.status, 402);

  const imported = await request(`/classes/${firstClass.id}/students/import`, {
    method: "POST",
    cookie: teacherCookie,
    body: { csv: "Plan Student Six" },
  });
  assert.equal(imported.status, 402);

  const detail = await request(`/classes/${firstClass.id}`, { cookie: teacherCookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.class.id, firstClass.id);

  const login = await request("/auth/student/login", {
    method: "POST",
    body: {
      joinCode: firstClass.joinCode,
      displayName: firstStudent.displayName,
      pin: firstStudent.pin,
    },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.student.displayName, firstStudent.displayName);

  const archivedOne = await request(`/classes/${secondClass.id}`, {
    method: "DELETE",
    cookie: teacherCookie,
  });
  assert.equal(archivedOne.status, 200);

  const archivedTwo = await request(`/classes/${thirdClass.id}`, {
    method: "DELETE",
    cookie: teacherCookie,
  });
  assert.equal(archivedTwo.status, 200);

  const afterArchive = await request("/billing", { cookie: teacherCookie });
  assert.equal(afterArchive.body.billing.usage.classes, 1);

  const restored = await request(`/classes/${secondClass.id}/restore`, {
    method: "POST",
    cookie: teacherCookie,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.class.archivedAt, null);
});
