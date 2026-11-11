import { query } from "./postgres.js";
import { AppError } from "../lib/errors.js";

/**
 * Postgres-backed implementation of the session store contract used by the
 * orchestrator. The JSON demo store exposes the same four operations, so the
 * agent workflow is unaware of where a session lives.
 */
export const classroomSessionStore = {
  findLearner,
  findSession,
  findSessionForStudent,
  listSessionsForLearner,
  replaceSession,
};

const LEARNER_TOPIC = "Integers and introductory algebra";

export async function findLearner(studentId) {
  const { rows } = await query(
    `select
       s.id, s.class_id, s.display_name,
       c.name as class_name, c.subject, c.grade
     from students s
     join classes c on c.id = s.class_id
     where s.id = $1
     limit 1`,
    [studentId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.display_name,
    grade: row.grade,
    subject: row.subject,
    topic: LEARNER_TOPIC,
    isDemo: false,
    accent: "mint",
    classId: row.class_id,
    className: row.class_name,
  };
}

export async function listSessionsForLearner(studentId) {
  const { rows } = await query(
    `select snapshot
     from learning_sessions
     where student_id = $1
     order by created_at desc`,
    [studentId],
  );
  return rows.map((row) => row.snapshot);
}

export async function findSession(sessionId) {
  const { rows } = await query(
    "select snapshot from learning_sessions where id = $1",
    [sessionId],
  );
  return rows[0]?.snapshot || null;
}

export async function findSessionForStudent(studentId, sessionId) {
  const { rows } = await query(
    `select snapshot, class_id, student_id
     from learning_sessions
     where id = $1 and student_id = $2`,
    [sessionId, studentId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    session: row.snapshot,
    classId: row.class_id,
    studentId: row.student_id,
  };
}

async function resolveClassId(session) {
  if (session.classId) return session.classId;

  const { rows } = await query("select class_id from students where id = $1", [
    session.learnerId,
  ]);
  if (!rows[0]) throw new AppError(404, "Student account not found.");
  return rows[0].class_id;
}

export async function replaceSession(session) {
  const classId = await resolveClassId(session);

  await query(
    `insert into learning_sessions
       (id, class_id, student_id, status, attempt, snapshot,
        created_at, updated_at, last_activity_at, completed_at)
     values
       ($1, $2, $3, $4, $5, $6::jsonb,
        coalesce($7::timestamptz, now()), coalesce($8::timestamptz, now()),
        $9::timestamptz, $10::timestamptz)
     on conflict (id) do update set
       class_id = excluded.class_id,
       student_id = excluded.student_id,
       status = excluded.status,
       attempt = excluded.attempt,
       snapshot = excluded.snapshot,
       updated_at = excluded.updated_at,
       last_activity_at = excluded.last_activity_at,
       completed_at = excluded.completed_at`,
    [
      session.id,
      classId,
      session.learnerId,
      session.status,
      session.attempt,
      JSON.stringify(session),
      session.createdAt || null,
      session.updatedAt || null,
      session.lastActivityAt || null,
      session.completedAt || null,
    ],
  );

  return session;
}
