import { classroomSessionStore } from "../db/classroomSessionRepository.js";
import { AppError } from "../lib/errors.js";
import {
  createLearningSession,
  submitDiagnostic,
  checkPractice,
  submitPractice,
  submitMastery,
} from "../orchestration/learningRecoveryOrchestrator.js";
import { ACTIVE_STATUSES, buildLearnerState } from "./learnerState.js";
import { serializeSession, sessionSummary } from "./serialize.js";

async function requireLearner(studentId) {
  const learner = await classroomSessionStore.findLearner(studentId);
  if (!learner) throw new AppError(404, "Student account not found.");
  return learner;
}

export async function getStudentLearnerState(studentId) {
  const learner = await requireLearner(studentId);
  const sessions = await classroomSessionStore.listSessionsForLearner(studentId);
  return buildLearnerState(learner, sessions);
}

export async function getStudentLearningProgress(studentId) {
  const learner = await requireLearner(studentId);
  const sessions = await classroomSessionStore.listSessionsForLearner(studentId);
  const active = sessions.find((session) => ACTIVE_STATUSES.includes(session.status)) || null;
  const latest = active || sessions[0] || null;

  return {
    learner: buildLearnerState(learner, sessions),
    currentSession: serializeSession(latest),
    activeSession: serializeSession(active),
    sessions: sessions.map(sessionSummary),
  };
}

export async function startStudentLearningSession(studentId, { restart = false } = {}) {
  const { session, resumed } = await createLearningSession(
    { learnerId: studentId, restart },
    classroomSessionStore,
  );

  return {
    session: serializeSession(session),
    learner: await getStudentLearnerState(studentId),
    resumed,
  };
}

export async function requireStudentSession(studentId, sessionId) {
  const owned = await classroomSessionStore.findSessionForStudent(studentId, sessionId);
  if (!owned) throw new AppError(404, "Learning session not found.");
  return owned.session;
}

export async function getStudentLearningSession(studentId, sessionId) {
  const session = await requireStudentSession(studentId, sessionId);
  return {
    session: serializeSession(session),
    learner: await getStudentLearnerState(studentId),
  };
}

export async function submitStudentDiagnostic(studentId, sessionId, answers) {
  await requireStudentSession(studentId, sessionId);
  const session = await submitDiagnostic(sessionId, answers, classroomSessionStore);
  return { session: serializeSession(session) };
}

export async function checkStudentPractice(studentId, sessionId, input) {
  await requireStudentSession(studentId, sessionId);
  return checkPractice(sessionId, input, classroomSessionStore);
}

export async function submitStudentPractice(studentId, sessionId, answers) {
  await requireStudentSession(studentId, sessionId);
  const session = await submitPractice(sessionId, answers, classroomSessionStore);
  return { session: serializeSession(session) };
}

export async function submitStudentMastery(studentId, sessionId, answers) {
  await requireStudentSession(studentId, sessionId);
  const session = await submitMastery(sessionId, answers, classroomSessionStore);
  return { session: serializeSession(session) };
}
