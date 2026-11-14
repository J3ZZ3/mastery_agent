import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeSamplePdf } from "./samplePdf.js";

process.env.AI_PROVIDER = "test";
process.env.EMAIL_DELIVERY = "disabled";
const testDataDir = await mkdtemp(path.join(tmpdir(), "mastery-teacher-resources-test-"));
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
  if (body !== undefined && !Buffer.isBuffer(body)) nextHeaders["Content-Type"] = "application/json";
  if (cookie) nextHeaders.Cookie = cookie;

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: nextHeaders,
    body:
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
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
const teacherEmail = `resources-${suffix}@example.com`;
const createdEmails = [teacherEmail];
const password = "correct horse battery";

let teacherCookie;
let teacherId;

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
  if (teacherId) {
    await rm(path.resolve("server", "uploads", teacherId), { recursive: true, force: true }).catch(() => {});
  }
});

test("teacher signup works without an invite code", { skip }, async () => {
  const config = await request("/auth/config");
  assert.equal(config.status, 200);
  assert.equal(config.body.teacherSignupOpen, true);
  assert.equal(config.body.pilotInviteRequired, undefined);

  const created = await request("/auth/teacher/signup", {
    method: "POST",
    body: { email: teacherEmail, name: "Resources Teacher", password },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.teacher.email, teacherEmail);
  assert.equal(created.body.teacher.plan, undefined);
  assert.equal(created.body.teacher.trialEndsAt, undefined);
  teacherCookie = created.cookie;
  teacherId = created.body.teacher.id;
});

test("plan info requires a signed-in teacher", { skip }, async () => {
  const response = await request("/plan/info");
  assert.equal(response.status, 401);
});

test("plan info responds instead of hanging and starts with no resources", { skip }, async () => {
  const response = await request("/plan/info", { cookie: teacherCookie });
  assert.equal(response.status, 200);
  assert.equal(response.body.plan, "resources");
  assert.equal(response.body.studentBook, null);
  assert.equal(response.body.teachersGuide, null);
  assert.deepEqual(response.body.usage, { classes: 0, students: 0 });
});

test("a teacher can upload a learner book and see it in plan info", { skip }, async () => {
  const upload = await request("/plan/resources/student-book", {
    method: "POST",
    cookie: teacherCookie,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": "grade-9-learner-book.pdf",
    },
    body: makeSamplePdf(),
  });

  assert.equal(upload.status, 201);
  assert.equal(upload.body.studentBook.name, "grade-9-learner-book.pdf");
  assert.ok(upload.body.studentBook.path);
  assert.equal(upload.body.studentBook.pageCount, 3);
  assert.equal(upload.body.studentBook.needsOcr, false);
  assert.ok(upload.body.studentBook.outline.length > 0);

  const info = await request("/plan/info", { cookie: teacherCookie });
  assert.equal(info.status, 200);
  assert.equal(info.body.studentBook.name, "grade-9-learner-book.pdf");
  assert.equal(info.body.studentBook.pageCount, 3);
});

test("the outline maps topics and subtopics to PDF pages", { skip }, async () => {
  const response = await request("/plan/resources/student-book/outline", {
    cookie: teacherCookie,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.pageCount, 3);
  assert.deepEqual(
    response.body.outline.find((entry) => entry.title === "Chapter 2: Algebra"),
    { title: "Chapter 2: Algebra", level: 1, page: 2 },
  );
  assert.deepEqual(
    response.body.outline.find((entry) => entry.title === "3.2 Triangles"),
    { title: "3.2 Triangles", level: 2, page: 3 },
  );
});

test("page text can be read for a specific page range", { skip }, async () => {
  const response = await request("/plan/resources/student-book/pages?from=2&to=2", {
    cookie: teacherCookie,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.pages.length, 1);
  assert.equal(response.body.pages[0].page, 2);
  assert.match(response.body.pages[0].text, /A variable stands for a number/);
});

// Syllabus discussion feature removed.
