import { randomInt } from "node:crypto";
import { query } from "../db/postgres.js";
import { hashSecret, verifySecret, generatePin } from "../auth/passwords.js";
import { newId } from "../lib/id.js";
import { AppError } from "../lib/errors.js";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 6;
const MAX_STUDENTS_PER_CLASS = 300;

const teacherDto = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
});

const classDto = (row) => ({
  id: row.id,
  name: row.name,
  subject: row.subject,
  grade: row.grade,
  joinCode: row.join_code,
  consentAttestedAt: row.consent_attested_at,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.student_count !== undefined ? { studentCount: Number(row.student_count) } : {}),
});

const studentDto = (row) => ({
  id: row.id,
  classId: row.class_id,
  displayName: row.display_name,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
});

const normalizeName = (value) => String(value).trim().replace(/\s+/g, " ");

const normalizeEmail = (value) => String(value).trim().toLowerCase();

const generateJoinCode = () => {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return code;
};

/* ------------------------------------------------------------------ */
/* Teachers                                                            */
/* ------------------------------------------------------------------ */

export async function signupTeacher({ email, name, password }) {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashSecret(password);

  try {
    const { rows } = await query(
      `insert into teachers (id, email, name, password_hash)
       values ($1, $2, $3, $4)
       returning id, email, name, created_at`,
      [newId("tch"), normalizedEmail, normalizeName(name), passwordHash],
    );
    return teacherDto(rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "An account with that email already exists.");
    }
    throw error;
  }
}

export async function authenticateTeacher({ email, password }) {
  const { rows } = await query(
    `select id, email, name, password_hash, created_at
     from teachers
     where lower(email) = lower($1)
     limit 1`,
    [normalizeEmail(email)],
  );

  const teacher = rows[0];
  const valid = teacher ? await verifySecret(password, teacher.password_hash) : false;
  if (!valid) throw new AppError(401, "Email or password is incorrect.");

  return teacherDto(teacher);
}

export async function getTeacher(teacherId) {
  const { rows } = await query(
    "select id, email, name, created_at from teachers where id = $1",
    [teacherId],
  );
  if (!rows[0]) throw new AppError(404, "Teacher account not found.");
  return teacherDto(rows[0]);
}

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

export async function createClass(teacherId, { name, subject, grade, consentAttested }) {
  if (consentAttested !== true) {
    throw new AppError(
      400,
      "Confirm that you have permission to create student accounts before creating a class.",
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      const { rows } = await query(
        `insert into classes
           (id, teacher_id, name, subject, grade, join_code, consent_attested_at)
         values ($1, $2, $3, $4, $5, $6, now())
         returning *`,
        [newId("cls"), teacherId, normalizeName(name), subject, grade ?? null, joinCode],
      );
      return classDto(rows[0]);
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }

  throw new AppError(500, "Could not allocate a class code. Please try again.");
}

export async function listClasses(teacherId) {
  const { rows } = await query(
    `select c.*, count(s.id) as student_count
     from classes c
     left join students s on s.class_id = c.id
     where c.teacher_id = $1 and c.archived_at is null
     group by c.id
     order by c.created_at desc`,
    [teacherId],
  );
  return rows.map(classDto);
}

export async function requireOwnedClass(teacherId, classId) {
  const { rows } = await query(
    "select * from classes where id = $1 and teacher_id = $2",
    [classId, teacherId],
  );
  if (!rows[0]) throw new AppError(404, "Class not found.");
  return rows[0];
}

export async function getClass(teacherId, classId) {
  const classroom = await requireOwnedClass(teacherId, classId);
  return { class: classDto(classroom), students: await listStudents(teacherId, classId) };
}

export async function updateClass(teacherId, classId, patch) {
  const current = await requireOwnedClass(teacherId, classId);

  const name = patch.name === undefined ? current.name : normalizeName(patch.name);
  const subject = patch.subject === undefined ? current.subject : patch.subject;
  const grade = patch.grade === undefined ? current.grade : patch.grade;

  const { rows } = await query(
    `update classes
     set name = $3, subject = $4, grade = $5, updated_at = now()
     where id = $1 and teacher_id = $2
     returning *`,
    [classId, teacherId, name, subject, grade ?? null],
  );
  return classDto(rows[0]);
}

export async function archiveClass(teacherId, classId) {
  const { rows } = await query(
    `update classes
     set archived_at = now(), updated_at = now()
     where id = $1 and teacher_id = $2
     returning *`,
    [classId, teacherId],
  );
  if (!rows[0]) throw new AppError(404, "Class not found.");
  return classDto(rows[0]);
}

/**
 * Replace the join code. Existing students stay signed in and their PINs keep
 * working; the old code can no longer be used to sign in.
 */
export async function rotateJoinCode(teacherId, classId) {
  await requireOwnedClass(teacherId, classId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      const { rows } = await query(
        `update classes
         set join_code = $3, updated_at = now()
         where id = $1 and teacher_id = $2
         returning *`,
        [classId, teacherId, joinCode],
      );
      return classDto(rows[0]);
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }

  throw new AppError(500, "Could not allocate a new class code. Please try again.");
}

/**
 * Hard-delete a class, its roster, learning sessions and student sessions.
 * This is the POPIA erasure path, not the reversible archive action.
 */
export async function deleteClassPermanently(teacherId, classId) {
  const { rowCount } = await query(
    "delete from classes where id = $1 and teacher_id = $2",
    [classId, teacherId],
  );
  if (!rowCount) throw new AppError(404, "Class not found.");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

export async function listStudents(teacherId, classId) {
  await requireOwnedClass(teacherId, classId);
  const { rows } = await query(
    `select id, class_id, display_name, created_at, last_seen_at
     from students
     where class_id = $1
     order by lower(display_name) asc`,
    [classId],
  );
  return rows.map(studentDto);
}

export async function getStudent(teacherId, classId, studentId) {
  await requireOwnedClass(teacherId, classId);
  const { rows } = await query(
    `select id, class_id, display_name, created_at, last_seen_at
     from students
     where id = $1 and class_id = $2`,
    [studentId, classId],
  );
  if (!rows[0]) throw new AppError(404, "Student not found in this class.");
  return studentDto(rows[0]);
}

export async function addStudent(teacherId, classId, { displayName }) {
  await requireOwnedClass(teacherId, classId);

  const { rows: counts } = await query(
    "select count(*)::int as total from students where class_id = $1",
    [classId],
  );
  if (counts[0].total >= MAX_STUDENTS_PER_CLASS) {
    throw new AppError(409, `A class can have at most ${MAX_STUDENTS_PER_CLASS} students.`);
  }

  const pin = generatePin();
  const pinHash = await hashSecret(pin);

  try {
    const { rows } = await query(
      `insert into students (id, class_id, display_name, pin_hash)
       values ($1, $2, $3, $4)
       returning id, class_id, display_name, created_at, last_seen_at`,
      [newId("stu"), classId, normalizeName(displayName), pinHash],
    );
    // The PIN is returned exactly once, at creation. Only its hash is stored.
    return { student: studentDto(rows[0]), pin };
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "A student with that name is already in this class.");
    }
    throw error;
  }
}

export async function resetStudentPin(teacherId, classId, studentId) {
  await requireOwnedClass(teacherId, classId);

  const pin = generatePin();
  const pinHash = await hashSecret(pin);

  const { rows } = await query(
    `update students
     set pin_hash = $3
     where id = $1 and class_id = $2
     returning id, class_id, display_name, created_at, last_seen_at`,
    [studentId, classId, pinHash],
  );
  if (!rows[0]) throw new AppError(404, "Student not found in this class.");

  return { student: studentDto(rows[0]), pin };
}

export async function removeStudent(teacherId, classId, studentId) {
  await requireOwnedClass(teacherId, classId);
  const { rowCount } = await query(
    "delete from students where id = $1 and class_id = $2",
    [studentId, classId],
  );
  if (!rowCount) throw new AppError(404, "Student not found in this class.");
  return { ok: true };
}

/**
 * Erase one student's learning history while keeping them on the roster. The
 * student can start a fresh cycle afterwards.
 */
export async function deleteStudentHistory(teacherId, classId, studentId) {
  await requireOwnedClass(teacherId, classId);
  const student = await getStudent(teacherId, classId, studentId);
  const { rowCount } = await query(
    "delete from learning_sessions where student_id = $1 and class_id = $2",
    [student.id, classId],
  );
  return { ok: true, deletedSessions: rowCount };
}

/* ------------------------------------------------------------------ */
/* Student access                                                      */
/* ------------------------------------------------------------------ */

const STUDENT_CLASS_SQL = `
  select
    s.id, s.class_id, s.display_name, s.created_at, s.last_seen_at, s.pin_hash,
    c.name as class_name, c.subject as class_subject, c.grade as class_grade,
    c.join_code as class_join_code
  from students s
  join classes c on c.id = s.class_id
`;

const studentClassDto = (row) => ({
  class: {
    id: row.class_id,
    name: row.class_name,
    subject: row.class_subject,
    grade: row.class_grade,
    joinCode: row.class_join_code,
  },
  student: studentDto(row),
});

export async function authenticateStudent({ joinCode, displayName, pin }) {
  const { rows } = await query(
    `${STUDENT_CLASS_SQL}
     where c.join_code = $1
       and lower(s.display_name) = lower($2)
       and c.archived_at is null
     limit 1`,
    [String(joinCode).trim().toUpperCase(), normalizeName(displayName)],
  );

  const row = rows[0];
  const valid = row ? await verifySecret(pin, row.pin_hash) : false;
  if (!valid) throw new AppError(401, "Class code, name or PIN is incorrect.");

  await query("update students set last_seen_at = now() where id = $1", [row.id]);
  return studentClassDto(row);
}

export async function getStudentClass(studentId) {
  const { rows } = await query(
    `${STUDENT_CLASS_SQL}
     where s.id = $1
     limit 1`,
    [studentId],
  );
  if (!rows[0]) throw new AppError(404, "Student account not found.");
  return studentClassDto(rows[0]);
}
