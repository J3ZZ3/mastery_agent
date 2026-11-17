import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const calls = [];
let failDesignerOnce = true;

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body);
  const system = parsed.messages?.[0]?.content || "";
  const user = parsed.messages?.[1]?.content || "";
  const agent = ["Assessment Agent", "Diagnostic Agent", "Learning Designer Agent"].find((name) =>
    system.includes(`You are the ${name}`),
  ) || "unknown";
  calls.push(agent);

  if (agent === "Learning Designer Agent" && failDesignerOnce) {
    failDesignerOnce = false;
    res.writeHead(429, { "Content-Type": "application/json", "retry-after": "0" });
    res.end(JSON.stringify({ error: { message: "Rate limit reached. Please try again in 1s." } }));
    return;
  }

  const marker = "Required JSON shape example:\n";
  const example = JSON.parse(user.slice(user.indexOf(marker) + marker.length));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(example) } }],
    }),
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

process.env.AI_PROVIDER = "groq";
process.env.GROQ_BASE_URL = `http://127.0.0.1:${server.address().port}/openai/v1`;
process.env.GROQ_API_KEY = "groq-test-key";
process.env.GROQ_MODEL = "primary-model";
process.env.GROQ_MODEL_FALLBACKS = "";
process.env.GROQ_FALLBACK_RETRIES = "0";
process.env.GROQ_TIMEOUT_MS = "5000";

const { submitDiagnostic } = await import("../server/orchestration/learningRecoveryOrchestrator.js");

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const session = {
  id: "ses_retry_test",
  learnerId: "learner_retry_test",
  status: "diagnostic",
  attempt: 0,
  threshold: 80,
  curriculum: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  completedAt: null,
  diagnostic: {
    questions: [
      {
        id: "d1",
        prompt: "Simplify 3x + 2x",
        hint: "Add the coefficients.",
        skill: "algebra",
        correctAnswer: "5x",
        explanation: "3x + 2x = 5x.",
        misconceptions: {},
      },
      {
        id: "d2",
        prompt: "Solve x + 3 = 7",
        hint: "Subtract 3 from both sides.",
        skill: "algebra",
        correctAnswer: "4",
        explanation: "x = 7 - 3 = 4.",
        misconceptions: {},
      },
    ],
    answers: {},
    submittedAt: null,
    report: null,
  },
  diagnosis: null,
  attempts: [],
  teacherInsight: null,
  events: [],
  error: null,
};

const store = {
  sessions: new Map([[session.id, structuredClone(session)]]),
  async findSession(id) {
    const found = this.sessions.get(id);
    return found ? structuredClone(found) : null;
  },
  async replaceSession(next) {
    this.sessions.set(next.id, structuredClone(next));
  },
  async findLearner() {
    return { id: "learner_retry_test", name: "Retry Learner", grade: 9, subject: "Mathematics", topic: "Algebra" };
  },
  async listSessionsForLearner() {
    return [];
  },
};

const answers = { d1: "6x", d2: "10" };

const question = (id, prompt, correctAnswer, explanation) => ({
  id,
  prompt,
  hint: "Use the method from the lesson.",
  skill: "algebra",
  correctAnswer,
  explanation,
  misconceptions: {},
});

const baseQuestions = [
  question("d1", "Simplify 3x + 2x", "5x", "3x + 2x = 5x."),
  question("d2", "Solve x + 3 = 7", "4", "x = 7 - 3 = 4."),
];

const makeSession = (id, overrides = {}) => ({
  id,
  learnerId: "learner_retry_test",
  status: "diagnostic",
  attempt: 0,
  threshold: 80,
  curriculum: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  completedAt: null,
  diagnostic: {
    questions: baseQuestions,
    answers: {},
    submittedAt: null,
    report: null,
  },
  diagnosis: null,
  attempts: [],
  teacherInsight: null,
  events: [],
  error: null,
  ...overrides,
});

test("a failed diagnostic can be retried without redoing the assessment", async () => {
  await assert.rejects(() => submitDiagnostic(session.id, answers, store));

  const failed = await store.findSession(session.id);
  assert.equal(failed.status, "error");
  assert.deepEqual(failed.diagnostic.answers, answers);
  assert.ok(failed.diagnostic.report, "assessment report is kept");
  assert.ok(failed.diagnosis, "diagnosis is kept");
  assert.equal(failed.attempts.length, 0);

  calls.length = 0;
  const retried = await submitDiagnostic(session.id, {}, store);

  assert.equal(retried.status, "learning");
  assert.equal(retried.attempts.length, 1);
  assert.ok(retried.attempts[0].intervention);
  // Only the designer is retried; assessment and diagnosis are reused.
  assert.deepEqual(calls, ["Learning Designer Agent"]);
  assert.equal(retried.error, null);
});

test("a stale analyzing session can be resumed without redoing the diagnostic", async () => {
  const stale = makeSession("ses_stale_test", {
    status: "analyzing",
    updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    diagnostic: {
      questions: baseQuestions,
      answers,
      submittedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      report: { totalQuestions: 2, correctAnswers: 0, scorePercent: 0, items: [], identifiedPatterns: [] },
    },
    diagnosis: {
      gapKey: "negative_operations",
      suspectedGap: "Combining like terms",
      relatedConcept: "Algebraic expressions",
      evidence: ["3x + 2x answered as 6x"],
      confidence: 0.8,
      reasoning: "Both items were incorrect.",
      isSurfaceLevel: false,
      severity: "high",
    },
  });
  store.sessions.set(stale.id, structuredClone(stale));

  calls.length = 0;
  const resumed = await submitDiagnostic(stale.id, {}, store);

  assert.equal(resumed.status, "learning");
  assert.equal(resumed.attempts.length, 1);
  assert.deepEqual(calls, ["Learning Designer Agent"]);
});

test("a fresh analyzing session cannot be submitted twice", async () => {
  const fresh = makeSession("ses_fresh_test", { status: "analyzing" });
  store.sessions.set(fresh.id, structuredClone(fresh));

  await assert.rejects(
    () => submitDiagnostic(fresh.id, {}, store),
    (error) => error.status === 409,
  );
});
