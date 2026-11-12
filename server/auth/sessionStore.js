import { newId } from "../lib/id.js";
import { query } from "../db/postgres.js";

const PRINCIPAL_SQL = `
  select
    s.id as session_id,
    s.role,
    s.expires_at,
    s.last_used_at,
    t.id as teacher_id,
    t.email as teacher_email,
    t.name as teacher_name,
    t.email_verified_at as teacher_email_verified_at,
    t.plan as teacher_plan,
    t.trial_ends_at as teacher_trial_ends_at,
    t.upgrade_requested_at as teacher_upgrade_requested_at,
    st.id as student_id,
    st.display_name as student_name,
    st.last_seen_at as student_last_seen_at,
    c.id as class_id,
    c.name as class_name,
    c.subject as class_subject,
    c.grade as class_grade,
    c.join_code as class_join_code
  from auth_sessions s
  left join teachers t on t.id = s.teacher_id
  left join students st on st.id = s.student_id
  left join classes c on c.id = st.class_id
  where s.token_hash = $1 and s.expires_at > now()
  limit 1
`;

export async function createAuthSession({ tokenHash, role, teacherId = null, studentId = null, expiresAt }) {
  const id = newId("ses");
  await query(
    `insert into auth_sessions (id, token_hash, role, teacher_id, student_id, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, tokenHash, role, teacherId, studentId, expiresAt],
  );
  return id;
}

export async function findAuthSession(tokenHash) {
  const { rows } = await query(PRINCIPAL_SQL, [tokenHash]);
  const row = rows[0];
  if (!row) return null;

  if (row.role === "teacher") {
    if (!row.teacher_id) return null;
    return {
      sessionId: row.session_id,
      role: "teacher",
      expiresAt: row.expires_at,
      teacher: {
        id: row.teacher_id,
        email: row.teacher_email,
        name: row.teacher_name,
        emailVerified: Boolean(row.teacher_email_verified_at),
        emailVerifiedAt: row.teacher_email_verified_at || null,
        plan: row.teacher_plan === "paid" ? "paid" : "pilot",
        trialEndsAt: row.teacher_trial_ends_at || null,
        upgradeRequestedAt: row.teacher_upgrade_requested_at || null,
      },
    };
  }

  if (!row.student_id || !row.class_id) return null;
  return {
    sessionId: row.session_id,
    role: "student",
    expiresAt: row.expires_at,
    student: {
      id: row.student_id,
      classId: row.class_id,
      displayName: row.student_name,
      lastSeenAt: row.student_last_seen_at,
    },
    class: {
      id: row.class_id,
      name: row.class_name,
      subject: row.class_subject,
      grade: row.class_grade,
      joinCode: row.class_join_code,
    },
  };
}

export async function touchAuthSession(sessionId) {
  await query(
    `update auth_sessions
     set last_used_at = now()
     where id = $1 and last_used_at < now() - interval '5 minutes'`,
    [sessionId],
  );
}

export async function deleteAuthSession(tokenHash) {
  await query("delete from auth_sessions where token_hash = $1", [tokenHash]);
}

/**
 * Sign a teacher out everywhere. Used after a password reset so a stolen
 * session cannot outlive the credential it was created with.
 */
export async function deleteTeacherAuthSessions(teacherId) {
  await query("delete from auth_sessions where teacher_id = $1", [teacherId]);
}

export async function deleteExpiredAuthSessions() {
  await query("delete from auth_sessions where expires_at <= now()");
}
