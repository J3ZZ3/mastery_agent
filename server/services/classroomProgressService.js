import { getClass, getStudent } from "./classroomService.js";
import {
  listSessionsForClass,
  listSessionsForLearner,
} from "../db/classroomSessionRepository.js";
import { ACTIVE_STATUSES, buildLearnerState } from "./learnerState.js";
import { serializeSession, sessionSummary } from "./serialize.js";

const LEARNER_TOPIC = "Integers and introductory algebra";

const learnerFor = (classroom, student) => ({
  id: student.id,
  name: student.displayName,
  grade: classroom.grade,
  subject: classroom.subject,
  topic: LEARNER_TOPIC,
  isDemo: false,
  accent: "sky",
});

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

function buildStats(studentStates, sessions) {
  const completed = sessions.filter((session) => session.status === "complete");
  const passed = completed.filter((session) => {
    const lastAttempt = session.attempts?.[session.attempts.length - 1];
    return Boolean(lastAttempt?.mastery?.result?.thresholdMet);
  });

  return {
    totalStudents: studentStates.length,
    activeStudents: studentStates.filter((student) => student.activeSessionId).length,
    recovered: studentStates.filter((student) => student.status === "complete_pass").length,
    needsSupport: studentStates.filter((student) =>
      ["complete_support", "retry", "error"].includes(student.status),
    ).length,
    notStarted: studentStates.filter((student) => student.status === "not_started").length,
    completedCycles: completed.length,
    masteryRecovery: completed.length
      ? Math.round((passed.length / completed.length) * 100)
      : 0,
  };
}

/**
 * Teacher-facing progress for a whole class. Every session is resolved by
 * class_id, so a teacher can only see students in their own class.
 */
export async function getClassProgress(teacherId, classId) {
  const { class: classroom, students } = await getClass(teacherId, classId);
  const rows = await listSessionsForClass(classId);

  const sessionsByStudent = new Map();
  for (const row of rows) {
    if (!sessionsByStudent.has(row.studentId)) sessionsByStudent.set(row.studentId, []);
    sessionsByStudent.get(row.studentId).push(row.session);
  }

  const studentStates = students.map((student) => ({
    ...buildLearnerState(learnerFor(classroom, student), sessionsByStudent.get(student.id) || []),
    createdAt: student.createdAt,
    lastSeenAt: student.lastSeenAt,
  }));

  return {
    class: classroom,
    stats: buildStats(studentStates, rows.map((row) => row.session)),
    students: studentStates,
  };
}

/**
 * One student's evidence for the teacher: the latest cycle, the mastery result
 * and the Teacher Insight summary, plus a short history of past cycles.
 */
export async function getClassStudentProgress(teacherId, classId, studentId) {
  const { class: classroom } = await getClass(teacherId, classId);
  const student = await getStudent(teacherId, classId, studentId);
  const sessions = await listSessionsForLearner(studentId);
  const ordered = [...sessions].sort(byNewest);
  const learner = buildLearnerState(learnerFor(classroom, student), ordered);

  const active = ordered.find((session) => ACTIVE_STATUSES.includes(session.status)) || null;
  const latest =
    active ||
    ordered.find((session) => session.status !== "abandoned") ||
    ordered[0] ||
    null;

  return {
    class: classroom,
    student,
    learner,
    currentSession: serializeSession(latest),
    sessions: ordered
      .filter((session) => session.status !== "abandoned")
      .map(sessionSummary),
  };
}
