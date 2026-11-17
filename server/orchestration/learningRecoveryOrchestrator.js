import { config } from "../config.js";
import { newId, nowIso } from "../lib/id.js";
import { AppError } from "../lib/errors.js";
import { friendlyAgentMessage } from "../lib/agentErrors.js";
import { getAiProvider } from "../providers/index.js";
import { runAssessmentAgent, runDiagnosticQuestionsAgent } from "../agents/assessmentAgent.js";
import { sanitizeQuestionPrompt } from "../domain/answer.js";
import { runDiagnosticAgent } from "../agents/diagnosticAgent.js";
import { runLearningDesignerAgent } from "../agents/learningDesignerAgent.js";
import { runTutorAgent, checkPracticeAnswer } from "../agents/tutorAgent.js";
import { runMasteryQuestionsAgent, runMasteryEvaluationAgent } from "../agents/masteryAgent.js";
import { runTeacherInsightAgent } from "../agents/teacherInsightAgent.js";
import { publishSessionEvent } from "./eventBus.js";
import { ACTIVE_STATUSES } from "../services/learnerState.js";
import {
  getCurriculumContextForLearner,
  getCurriculumContextForSession,
} from "../services/curriculumContextService.js";

const ai = getAiProvider();

async function recordEvent(session, { agent, status, message, summary = "", attempt = session.attempt, durationMs = null, provider = null }, store) {
  const at = nowIso();
  const event = {
    id: newId("evt"),
    agent,
    status,
    message,
    summary,
    attempt,
    at,
    durationMs,
    provider,
  };

  session.events.push(event);
  session.updatedAt = at;
  session.lastActivityAt = at;

  await store.replaceSession(session);
  publishSessionEvent(session.id, event);
  return event;
}

async function trackAgent({
  session,
  store,
  agent,
  attempt,
  startMessage,
  run,
  onData,
  completedMessage,
  summary,
}) {
  const startedAt = Date.now();
  await recordEvent(session, { agent, status: "started", message: startMessage, attempt }, store);

  try {
    const result = await run();
    onData(result.data);
    const durationMs = Date.now() - startedAt;
    await recordEvent(session, {
      agent,
      status: "completed",
      message: typeof completedMessage === "function" ? completedMessage(result.data) : completedMessage,
      summary: summary(result.data),
      attempt,
      durationMs,
      provider: result.meta?.provider || null,
    }, store);
    return result;
  } catch (error) {
    await recordEvent(session, {
      agent,
      status: "failed",
      message: "Agent could not complete this step.",
      summary: error.message,
      attempt,
      durationMs: Date.now() - startedAt,
    }, store);
    throw error;
  }
}

async function markError(session, error, store) {
  const message = friendlyAgentMessage(error);
  if (message !== error.message) {
    console.warn(`[agents] ${session.id} paused: ${error.message}`);
  }
  session.status = "error";
  session.error = message;
  session.updatedAt = nowIso();
  await store.replaceSession(session);
  return message === error.message ? error : new AppError(503, message);
}

const assessmentSummary = (data) =>
  `${data.correctAnswers}/${data.totalQuestions} correct · ${data.identifiedPatterns.length} pattern${
    data.identifiedPatterns.length === 1 ? "" : "s"
  } identified`;
const diagnosisSummary = (data) => `${data.suspectedGap} · ${Math.round(data.confidence * 100)}% confidence`;
const designSummary = (data) =>
  `${data.workedExamples.length} worked examples · ${data.practiceQuestions.length} practice questions${data.adapted ? " · adapted" : ""}`;
const tutorSummary = (data) => `${data.correct}/${data.total} correct · feedback delivered`;
const masteryQuestionsSummary = (data) => `${data.questions.length} new questions · ${data.threshold}% threshold`;
const masteryResultSummary = (data) =>
  `${data.correct}/${data.total} correct · ${data.scorePercent}% · ${data.thresholdMet ? "threshold met" : "threshold not met"}`;
const insightSummary = (data) => data.headline;

function buildAttempt(attemptNumber, intervention) {
  return {
    attempt: attemptNumber,
    intervention,
    createdAt: nowIso(),
    practice: {
      answers: {},
      startedAt: null,
      submittedAt: null,
      completedAt: null,
      result: null,
    },
    mastery: null,
    completedAt: null,
  };
}

function validateAllAnswered(questions, answers, label) {
  const missing = questions.filter((question) => !String(answers[question.id] ?? "").trim()).map((question) => question.prompt);
  if (missing.length > 0) {
    throw new AppError(400, `Please answer every ${label} question before submitting.`, { missing });
  }
}

export async function createLearningSession({ learnerId, restart = false }, store) {
  if (!store) {
    throw new AppError(500, "Session store is not configured.");
  }
  const learner = await store.findLearner(learnerId);
  if (!learner) {
    throw new AppError(404, "Learner not found.");
  }

  const sessions = await store.listSessionsForLearner(learnerId);
  const active = sessions.find((session) => ACTIVE_STATUSES.includes(session.status));

  if (active && !restart) {
    return { session: active, learner, resumed: true };
  }

  if (active && restart) {
    active.status = "abandoned";
    active.updatedAt = nowIso();
    await store.replaceSession(active);
  }

  const curriculum = await getCurriculumContextForLearner(learner, {
    preferTerms: ["algebra", "algebraic", "equation", "equations", "expression", "expressions", "formula", "formulas"],
  });

  const generated = await runDiagnosticQuestionsAgent({
    learner,
    curriculum,
    ai,
  });
  const questions = generated.data.questions.map((question, idx) => ({
    id: question.id || `d${idx + 1}`,
    prompt: sanitizeQuestionPrompt(question.prompt),
    hint: question.hint || "",
    skill: question.skill || "general",
    correctAnswer: String(question.correctAnswer ?? "").trim(),
    explanation: question.explanation || "",
    misconceptions: {},
  }));

  const now = nowIso();
  const session = {
    id: newId("ses"),
    learnerId,
    ...(learner.classId ? { classId: learner.classId } : {}),
    status: "diagnostic",
    attempt: 0,
    threshold: config.masteryThreshold,
    curriculum,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    completedAt: null,
    diagnostic: {
      questions,
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

  await store.replaceSession(session);
  return { session, learner, resumed: false };
}

export async function submitDiagnostic(sessionId, answers, store = demoSessionStore) {
  const session = await store.findSession(sessionId);
  if (!session) throw new AppError(404, "Learning session not found.");

  // Once the cycle has moved past analysis, resubmitting is a no-op.
  if (["learning", "retry", "mastery", "complete", "abandoned"].includes(session.status)) {
    return session;
  }

  const retrying = session.status === "error";
  // A server restart or crash can leave a session in "analyzing" with no agent
  // running. Allow a retry once it is clearly stale, so the learner is not
  // locked out of their cycle.
  const ANALYSIS_STALE_MS = 5 * 60 * 1000;
  const staleAnalyzing =
    session.status === "analyzing" &&
    Date.now() - new Date(session.updatedAt || 0).getTime() > ANALYSIS_STALE_MS;
  const resuming = retrying || staleAnalyzing;

  if (session.status !== "diagnostic" && !resuming) {
    throw new AppError(409, "This diagnostic has already been submitted.");
  }

  // On a retry the learner keeps the answers they already gave; they do not
  // have to redo the diagnostic. Any newly submitted answers are merged in.
  const effectiveAnswers = resuming
    ? { ...(session.diagnostic.answers || {}), ...answers }
    : answers;

  validateAllAnswered(session.diagnostic.questions, effectiveAnswers, "diagnostic");

  session.diagnostic.answers = effectiveAnswers;
  session.diagnostic.submittedAt = session.diagnostic.submittedAt || nowIso();
  session.status = "analyzing";
  session.error = null;
  session.updatedAt = nowIso();
  await store.replaceSession(session);

  try {
    // Resume from the first step that has not completed yet, so a retry does
    // not repeat (or re-pay for) an agent that already produced its result.
    if (!session.diagnostic.report) {
      await trackAgent({
        session,
        store,
        agent: "assessment",
        attempt: 1,
        startMessage: "Analysing the submitted diagnostic answers.",
        run: () =>
          runAssessmentAgent({
            questions: session.diagnostic.questions,
            answers: effectiveAnswers,
            ai,
            curriculum: session.curriculum,
          }),
        onData: (data) => {
          session.diagnostic.report = data;
        },
        completedMessage: "Assessment analysed.",
        summary: assessmentSummary,
      });
    }

    if (!session.diagnosis) {
      await trackAgent({
        session,
        store,
        agent: "diagnostic",
        attempt: 1,
        startMessage: "Looking for a prerequisite gap behind the errors.",
        run: () =>
          runDiagnosticAgent({
            report: session.diagnostic.report,
            ai,
            curriculum: session.curriculum,
          }),
        onData: (data) => {
          session.diagnosis = data;
        },
        completedMessage: "Diagnostic hypothesis formed.",
        summary: diagnosisSummary,
      });

      // Refine book context now that we know the suspected gap/topic.
      session.curriculum = await getCurriculumContextForSession(session, store, {
        gapKey: session.diagnosis?.gapKey,
        diagnosis: session.diagnosis,
      });
    }

    if (!session.attempts?.[0]?.intervention) {
      await trackAgent({
        session,
        store,
        agent: "designer",
        attempt: 1,
        startMessage: "Designing a personalised intervention.",
        run: () =>
          runLearningDesignerAgent({
            diagnosis: session.diagnosis,
            report: session.diagnostic.report,
            attempt: 1,
            ai,
            curriculum: session.curriculum,
          }),
        onData: (data) => {
          session.attempts = [buildAttempt(1, data)];
          session.attempt = 1;
        },
        completedMessage: "Intervention ready.",
        summary: designSummary,
      });
    }

    session.status = "learning";
    session.updatedAt = nowIso();
    await store.replaceSession(session);
    return session;
  } catch (error) {
    throw await markError(session, error, store);
  }
}

export async function checkPractice(sessionId, { questionId, answer }, store = demoSessionStore) {
  const session = await store.findSession(sessionId);
  if (!session) throw new AppError(404, "Learning session not found.");
  if (!["learning", "retry"].includes(session.status)) {
    throw new AppError(409, "Practice is not open for this session.");
  }

  const attempt = session.attempts[session.attempts.length - 1];
  if (!attempt) throw new AppError(409, "No active attempt found.");

  const question = attempt.intervention.practiceQuestions.find((item) => item.id === questionId);
  if (!question) throw new AppError(404, "Practice question not found.");
  if (attempt.practice.result) throw new AppError(409, "This practice set has already been submitted.");

  if (!attempt.practice.startedAt) {
    attempt.practice.startedAt = nowIso();
    await recordEvent(session, {
      agent: "tutor",
      status: "started",
      message: "Guiding the learner through the lesson and practice.",
      attempt: attempt.attempt,
    }, store);
  }

  attempt.practice.answers[questionId] = answer;
  const check = checkPracticeAnswer({ question, answer });

  await recordEvent(session, {
    agent: "tutor",
    status: "progress",
    message: `Checked practice item ${question.id.toUpperCase()}.`,
    summary: check.correct ? "Correct · feedback delivered" : "Incorrect · hint offered",
    attempt: attempt.attempt,
  }, store);

  return {
    check,
    answeredCount: Object.keys(attempt.practice.answers).length,
    total: attempt.intervention.practiceQuestions.length,
  };
}

export async function submitPractice(sessionId, answers, store = demoSessionStore) {
  const session = await store.findSession(sessionId);
  if (!session) throw new AppError(404, "Learning session not found.");

  const resuming = session.status === "error";
  if (!["learning", "retry"].includes(session.status) && !resuming) {
    throw new AppError(409, "Practice is not open for this session.");
  }

  const attempt = session.attempts[session.attempts.length - 1];
  if (!attempt) throw new AppError(409, "No active attempt found.");

  // A repeat submission after the tutor already reviewed the set resumes at
  // the mastery-question step instead of re-running (and re-paying for) the
  // review.
  if (attempt.practice.result && !resuming) return session;

  // On a retry the learner keeps the practice answers they already gave; they
  // do not have to redo the practice set. Any newly submitted answers are
  // merged in.
  const effectiveAnswers = resuming
    ? { ...(attempt.practice.answers || {}), ...answers }
    : answers;

  if (!attempt.practice.result) {
    validateAllAnswered(attempt.intervention.practiceQuestions, effectiveAnswers, "practice");
    attempt.practice.answers = effectiveAnswers;
    attempt.practice.submittedAt = attempt.practice.submittedAt || nowIso();
  }

  // Clear a previous failure and restore the phase this attempt belongs to.
  session.status = attempt.attempt > 1 ? "retry" : "learning";
  session.error = null;
  session.updatedAt = nowIso();

  if (!attempt.practice.result && !attempt.practice.startedAt) {
    attempt.practice.startedAt = nowIso();
    await recordEvent(session, {
      agent: "tutor",
      status: "started",
      message: "Guiding the learner through the lesson and practice.",
      attempt: attempt.attempt,
    }, store);
  } else {
    await store.replaceSession(session);
  }

  try {
    // Resume from the first step that has not completed yet.
    if (!attempt.practice.result) {
      await trackAgent({
        session,
        store,
        agent: "tutor",
        attempt: attempt.attempt,
        startMessage: "Reviewing the completed practice set.",
        run: () =>
          runTutorAgent({
            intervention: attempt.intervention,
            answers: attempt.practice.answers,
            ai,
            curriculum: session.curriculum,
          }),
        onData: (data) => {
          attempt.practice.result = data;
          attempt.practice.completedAt = nowIso();
        },
        completedMessage: "Practice session complete.",
        summary: tutorSummary,
      });
    }

    if (!attempt.mastery) {
      await trackAgent({
        session,
        store,
        agent: "mastery",
        attempt: attempt.attempt,
        startMessage: "Preparing a fresh follow-up assessment.",
        run: () =>
          runMasteryQuestionsAgent({
            gapKey: session.diagnosis?.gapKey,
            attempt: attempt.attempt,
            diagnosis: session.diagnosis,
            report: session.diagnostic?.report,
            ai,
            curriculum: session.curriculum,
          }),
        onData: (data) => {
          attempt.mastery = {
            questions: data.questions.map((question) => ({ ...question })),
            generatedAt: nowIso(),
            submittedAt: null,
            answers: {},
            result: null,
          };
          session.threshold = data.threshold;
        },
        completedMessage: "Follow-up assessment prepared.",
        summary: masteryQuestionsSummary,
      });
    }

    session.status = "mastery";
    session.updatedAt = nowIso();
    await store.replaceSession(session);
    return session;
  } catch (error) {
    throw await markError(session, error, store);
  }
}

export async function submitMastery(sessionId, answers, store = demoSessionStore) {
  const session = await store.findSession(sessionId);
  if (!session) throw new AppError(404, "Learning session not found.");

  const resuming = session.status === "error";
  if (session.status !== "mastery" && !resuming) {
    throw new AppError(409, "The mastery assessment is not open for this session.");
  }

  const attempt = session.attempts[session.attempts.length - 1];

  // A failed run may have already adapted the intervention and pushed the next
  // attempt. In that case there is nothing left to evaluate; just reopen it.
  if (!attempt?.mastery) {
    if (!resuming || !attempt || attempt.attempt <= 1) {
      throw new AppError(409, "No mastery assessment has been prepared.");
    }

    session.status = "retry";
    session.error = null;
    session.updatedAt = nowIso();
    session.lastActivityAt = nowIso();
    await store.replaceSession(session);
    return session;
  }

  // Once the mastery result exists, a repeated submission must not re-run the
  // evaluation. It may still need to finish the insight or adaptation step.
  if (!attempt.mastery.result) {
    // On a retry the learner keeps the mastery answers they already gave; any
    // newly submitted answers are merged in.
    const effectiveAnswers = resuming
      ? { ...(attempt.mastery.answers || {}), ...answers }
      : answers;

    validateAllAnswered(attempt.mastery.questions, effectiveAnswers, "mastery");

    attempt.mastery.answers = effectiveAnswers;
    attempt.mastery.submittedAt = attempt.mastery.submittedAt || nowIso();
    session.status = "mastery";
    session.error = null;
    session.updatedAt = nowIso();
    await store.replaceSession(session);
  } else {
    // The evaluation already finished; only a later step failed.
    if (session.status === "mastery") return session;
    session.status = "mastery";
    session.error = null;
    session.updatedAt = nowIso();
    await store.replaceSession(session);
  }

  try {
    let masteryResult = attempt.mastery.result;

    // Resume from the first step that has not completed yet.
    if (!masteryResult) {
      await trackAgent({
        session,
        store,
        agent: "mastery",
        attempt: attempt.attempt,
        startMessage: "Evaluating the follow-up answers against the threshold.",
        run: () =>
          runMasteryEvaluationAgent({
            questions: attempt.mastery.questions,
            answers: attempt.mastery.answers,
            attempt: attempt.attempt,
            initialScore: session.diagnostic.report.scorePercent,
            ai,
            curriculum: session.curriculum,
          }),
        onData: (data) => {
          masteryResult = data;
          attempt.mastery.result = data;
          attempt.completedAt = nowIso();
        },
        completedMessage: (data) => (data.thresholdMet ? "Mastery demonstrated." : "Mastery threshold not yet met."),
        summary: masteryResultSummary,
      });
    }

    const learner = await store.findLearner(session.learnerId);
    const passed = Boolean(masteryResult?.thresholdMet);
    const exhausted = attempt.attempt >= config.maxAttempts;

    if (passed || exhausted) {
      if (!session.teacherInsight) {
        await trackAgent({
          session,
          store,
          agent: "insight",
          attempt: attempt.attempt,
          startMessage: "Converting the completed cycle into a teacher summary.",
          run: () =>
            runTeacherInsightAgent({
              learner: learner || { name: "The learner" },
              session,
              ai,
              curriculum: session.curriculum,
            }),
          onData: (data) => {
            session.teacherInsight = data;
          },
          completedMessage: passed ? "Teacher insight ready." : "Teacher review recommended.",
          summary: insightSummary,
        });
      }

      session.status = "complete";
      session.completedAt = session.completedAt || nowIso();
    } else {
      const nextAttempt = attempt.attempt + 1;
      const alreadyAdapted = session.attempts.some((item) => item.attempt === nextAttempt);

      if (!alreadyAdapted) {
        await trackAgent({
          session,
          store,
          agent: "designer",
          attempt: nextAttempt,
          startMessage: "Adapting the intervention from the remaining difficulty.",
          run: () =>
            runLearningDesignerAgent({
              diagnosis: session.diagnosis,
              report: session.diagnostic.report,
              attempt: nextAttempt,
              ai,
              curriculum: session.curriculum,
              remainingDifficulty: masteryResult.remainingDifficulty,
            }),
          onData: (data) => {
            const newAttempt = buildAttempt(nextAttempt, data);
            session.attempts.push(newAttempt);
            session.attempt = nextAttempt;
          },
          completedMessage: "Adapted intervention ready.",
          summary: designSummary,
        });
      }

      session.status = "retry";
    }

    session.error = null;
    session.updatedAt = nowIso();
    session.lastActivityAt = nowIso();
    await store.replaceSession(session);
    return session;
  } catch (error) {
    throw await markError(session, error, store);
  }
}

export function getActiveAttempt(session) {
  return session.attempts[session.attempts.length - 1] || null;
}
