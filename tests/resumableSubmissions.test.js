import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

/**
 * A failed practice review, mastery evaluation or teacher-insight step must be
 * resumable: the learner keeps the answers they already gave and the agent run
 * continues from the first unfinished step.
 */

const calls = [];
let counters = {};
let failures = {};

const classify = (system) => {
  if (system.includes("You are the Tutor Agent")) return "tutor";
  if (system.includes("You are the Teacher Insight Agent")) return "insight";
  if (system.includes("You are the Learning Designer Agent")) return "designer";
  if (system.includes("Generate a short follow-up mastery assessment")) return "masteryQuestions";
  if (system.includes("Evaluate the follow-up assessment")) return "masteryEvaluation";
  return "unknown";
};

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body);
  const system = parsed.messages?.[0]?.content || "";
  const user = parsed.messages?.[1]?.content || "";
  const agent = classify(system);
  calls.push(agent);
  counters[agent] = (counters[agent] || 0) + 1;

  if (failures[agent] && counters[agent] <= failures[agent]) {
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

const { submitPractice, submitMastery } = await import(
  "../server/orchestration/learningRecoveryOrchestrator.js"
);

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const now = () => new Date().toISOString();

const intervention = () => ({
  gapKey: "negative_operations",
  title: "Adding and subtracting integers",
  objective: "Use a number line to add and subtract integers.",
  summary: "Rebuild integer operations around the direction of a sign.",
  sections: [{ id: "direction", title: "A sign tells you direction", body: "Move right for positive, left for negative." }],
  numberLine: null,
  workedExamples: [{ title: "Start at -3 and move 2 left", steps: ["Find -3.", "Move 2 left."], answer: "-5" }],
  practiceQuestions: [
    {
      id: "p1",
      prompt: "Simplify 2x + 3x",
      hint: "Add the coefficients.",
      skill: "algebra",
      correctAnswer: "5x",
      explanation: "2x + 3x = 5x.",
    },
    {
      id: "p2",
      prompt: "Solve x + 4 = 9",
      hint: "Subtract 4 from both sides.",
      skill: "algebra",
      correctAnswer: "5",
      explanation: "x = 9 - 4 = 5.",
    },
  ],
  recap: "Add like terms, then check the sign.",
  adapted: false,
  adaptationNote: null,
});

const masteryQuestions = () => [
  {
    id: "m11",
    prompt: "Simplify 4x + 2x",
    hint: "Add the coefficients.",
    skill: "algebra",
    correctAnswer: "6x",
    explanation: "4x + 2x = 6x.",
  },
  {
    id: "m12",
    prompt: "Solve x + 6 = 11",
    hint: "Subtract 6 from both sides.",
    skill: "algebra",
    correctAnswer: "5",
    explanation: "x = 11 - 6 = 5.",
  },
];

const makeSession = (overrides = {}) => {
  const created = now();
  return {
    id: "ses_resume_test",
    learnerId: "learner_resume_test",
    status: "learning",
    attempt: 1,
    threshold: 80,
    curriculum: null,
    createdAt: created,
    updatedAt: created,
    lastActivityAt: created,
    completedAt: null,
    diagnostic: {
      questions: [],
      answers: {},
      submittedAt: created,
      report: {
        totalQuestions: 5,
        correctAnswers: 1,
        scorePercent: 20,
        confidence: 0.8,
        items: [],
        identifiedPatterns: [],
      },
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
    attempts: [
      {
        attempt: 1,
        intervention: intervention(),
        createdAt: created,
        practice: {
          answers: { p1: "5x", p2: "5" },
          startedAt: created,
          submittedAt: created,
          completedAt: null,
          result: null,
        },
        mastery: null,
        completedAt: null,
      },
    ],
    teacherInsight: null,
    events: [],
    error: null,
    ...overrides,
  };
};

const makeMasterySession = (overrides = {}) => {
  const session = makeSession(overrides);
  session.status = "mastery";
  session.attempts[0].practice.result = {
    total: 2,
    correct: 2,
    scorePercent: 100,
    results: [],
    feedbackSummary: "All practice answers were correct.",
    needsReteach: false,
    nextFocus: "Ready for the mastery check.",
  };
  session.attempts[0].practice.completedAt = now();
  session.attempts[0].mastery = {
    questions: masteryQuestions(),
    generatedAt: now(),
    submittedAt: null,
    answers: {},
    result: null,
  };
  return session;
};

const makeStore = (session) => ({
  sessions: new Map([[session.id, structuredClone(session)]]),
  async findSession(id) {
    const found = this.sessions.get(id);
    return found ? structuredClone(found) : null;
  },
  async replaceSession(next) {
    this.sessions.set(next.id, structuredClone(next));
  },
  async findLearner() {
    return { id: "learner_resume_test", name: "Retry Learner", grade: 9, subject: "Mathematics", topic: "Algebra" };
  },
  async listSessionsForLearner() {
    return [];
  },
});

const resetCalls = (nextFailures = {}) => {
  calls.length = 0;
  counters = {};
  failures = nextFailures;
};

test("a failed practice review resumes without redoing the practice set", async () => {
  resetCalls({ tutor: 1 });
  const session = makeSession();
  const store = makeStore(session);

  await assert.rejects(() => submitPractice(session.id, { p1: "5x", p2: "5" }, store));

  const failed = await store.findSession(session.id);
  assert.equal(failed.status, "error");
  assert.deepEqual(failed.attempts[0].practice.answers, { p1: "5x", p2: "5" });
  assert.equal(failed.attempts[0].practice.result, null);
  assert.equal(failed.attempts[0].mastery, null);

  resetCalls();
  const resumed = await submitPractice(session.id, {}, store);

  assert.equal(resumed.status, "mastery");
  assert.ok(resumed.attempts[0].practice.result);
  assert.equal(resumed.attempts[0].mastery.questions.length, 5);
  assert.deepEqual(calls, ["tutor", "masteryQuestions"]);
  assert.equal(resumed.error, null);
});

test("a failed mastery-question generation resumes after the practice review", async () => {
  resetCalls({ masteryQuestions: 1 });
  const session = makeSession();
  const store = makeStore(session);

  await assert.rejects(() => submitPractice(session.id, { p1: "5x", p2: "5" }, store));

  const failed = await store.findSession(session.id);
  assert.equal(failed.status, "error");
  assert.ok(failed.attempts[0].practice.result, "practice review is kept");
  assert.equal(failed.attempts[0].mastery, null);

  resetCalls();
  const resumed = await submitPractice(session.id, {}, store);

  assert.equal(resumed.status, "mastery");
  assert.equal(resumed.attempts[0].mastery.questions.length, 5);
  // The tutor review is not repeated.
  assert.deepEqual(calls, ["masteryQuestions"]);
});

test("a failed mastery evaluation resumes without redoing the check", async () => {
  resetCalls({ masteryEvaluation: 1 });
  const session = makeMasterySession();
  const store = makeStore(session);
  const answers = { m11: "6x", m12: "5" };

  await assert.rejects(() => submitMastery(session.id, answers, store));

  const failed = await store.findSession(session.id);
  assert.equal(failed.status, "error");
  assert.deepEqual(failed.attempts[0].mastery.answers, answers);
  assert.equal(failed.attempts[0].mastery.result, null);
  assert.equal(failed.teacherInsight, null);

  resetCalls();
  const resumed = await submitMastery(session.id, {}, store);

  assert.equal(resumed.status, "complete");
  assert.ok(resumed.attempts[0].mastery.result.thresholdMet);
  assert.ok(resumed.teacherInsight);
  assert.deepEqual(calls, ["masteryEvaluation", "insight"]);
  assert.equal(resumed.error, null);
});

test("a failed teacher-insight step resumes without re-running the evaluation", async () => {
  resetCalls({ insight: 1 });
  const session = makeMasterySession();
  const store = makeStore(session);

  await assert.rejects(() => submitMastery(session.id, { m11: "6x", m12: "5" }, store));

  const failed = await store.findSession(session.id);
  assert.equal(failed.status, "error");
  assert.ok(failed.attempts[0].mastery.result, "mastery result is kept");
  assert.equal(failed.teacherInsight, null);

  resetCalls();
  const resumed = await submitMastery(session.id, {}, store);

  assert.equal(resumed.status, "complete");
  assert.ok(resumed.teacherInsight);
  assert.deepEqual(calls, ["insight"]);
});

test("a failed adapted intervention resumes at the designer step", async () => {
  resetCalls({ designer: 1 });
  const session = makeMasterySession();
  const store = makeStore(session);

  await assert.rejects(() => submitMastery(session.id, { m11: "0", m12: "0" }, store));

  const failed = await store.findSession(session.id);
  assert.equal(failed.status, "error");
  assert.equal(failed.attempts[0].mastery.result.thresholdMet, false);
  assert.equal(failed.attempts.length, 1);

  resetCalls();
  const resumed = await submitMastery(session.id, {}, store);

  assert.equal(resumed.status, "retry");
  assert.equal(resumed.attempts.length, 2);
  assert.equal(resumed.attempts[1].attempt, 2);
  assert.ok(resumed.attempts[1].intervention);
  // The evaluation is reused; only the adapted lesson is generated.
  assert.deepEqual(calls, ["designer"]);
  assert.equal(resumed.error, null);
});
