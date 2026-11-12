import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { deleteTeacherAuthSessions } from "../auth/sessionStore.js";
import {
  findTeacherByEmail,
  getTeacher,
  markTeacherEmailVerified,
  setTeacherPassword,
} from "./classroomService.js";
import { emailVerificationEmail, passwordResetEmail, sendMail } from "./mailer.js";
import {
  consumeTeacherToken,
  createTeacherToken,
  deleteExpiredTeacherTokens,
  invalidateTeacherTokens,
  TOKEN_PURPOSES,
} from "./teacherTokenService.js";

/**
 * Teacher account lifecycle: email verification and password reset. Both use
 * single-use hashed tokens. Password reset also revokes every teacher session
 * so a stolen cookie cannot outlive the password change.
 */

export async function issueEmailVerification(teacher) {
  if (!teacher || teacher.emailVerified) return null;

  await invalidateTeacherTokens(teacher.id, TOKEN_PURPOSES.emailVerification);
  const token = await createTeacherToken(
    teacher.id,
    TOKEN_PURPOSES.emailVerification,
    config.emailVerificationTtlHours * 60 * 60 * 1000,
  );

  await sendMail(emailVerificationEmail({ teacher, token }));
  deleteExpiredTeacherTokens().catch(() => {});
  return token;
}

/**
 * Always resolves, even for an unknown address, so the endpoint cannot be used
 * to discover which teachers have accounts.
 */
export async function requestTeacherPasswordReset(email) {
  const teacher = await findTeacherByEmail(email);
  if (!teacher) return { sent: false };

  await invalidateTeacherTokens(teacher.id, TOKEN_PURPOSES.passwordReset);
  const token = await createTeacherToken(
    teacher.id,
    TOKEN_PURPOSES.passwordReset,
    config.passwordResetTtlMinutes * 60 * 1000,
  );

  await sendMail(passwordResetEmail({ teacher, token }));
  deleteExpiredTeacherTokens().catch(() => {});
  return { sent: true };
}

export async function resetTeacherPassword(token, password) {
  const teacherId = await consumeTeacherToken(token, TOKEN_PURPOSES.passwordReset);
  if (!teacherId) {
    throw new AppError(400, "This password reset link is invalid or has expired.");
  }

  const teacher = await setTeacherPassword(teacherId, password);
  await deleteTeacherAuthSessions(teacherId);
  return teacher;
}

export async function verifyTeacherEmail(token) {
  const teacherId = await consumeTeacherToken(token, TOKEN_PURPOSES.emailVerification);
  if (!teacherId) {
    throw new AppError(400, "This verification link is invalid or has expired.");
  }

  return markTeacherEmailVerified(teacherId);
}

export async function resendTeacherVerification(teacherId) {
  const teacher = await getTeacher(teacherId);
  if (teacher.emailVerified) return { alreadyVerified: true };

  await issueEmailVerification(teacher);
  return { alreadyVerified: false };
}
