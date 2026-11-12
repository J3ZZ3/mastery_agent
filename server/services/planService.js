import { config } from "../config.js";
import { query } from "../db/postgres.js";
import { AppError } from "../lib/errors.js";
import { sendMail, upgradeRequestEmail } from "./mailer.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const PLAN_LIMITS = {
  pilot: {
    maxClasses: config.pilotMaxClasses,
    maxStudentsPerClass: config.pilotMaxStudentsPerClass,
  },
  paid: {
    maxClasses: config.paidMaxClasses,
    maxStudentsPerClass: config.paidMaxStudentsPerClass,
  },
};

const normalizePlan = (plan) => (plan === "paid" ? "paid" : "pilot");
const planLabel = (plan) => (plan === "paid" ? "paid plan" : "free pilot");

export function limitsForPlan(plan) {
  return PLAN_LIMITS[normalizePlan(plan)];
}

/** New teachers start on the free pilot with a trial end date. */
export function newTeacherTrialEnd() {
  return new Date(Date.now() + config.pilotTrialDays * DAY_MS).toISOString();
}

/**
 * Plan, trial state and current usage for one teacher. Archived classes do not
 * count toward the active-class limit, and their students do not count toward
 * active usage.
 */
export async function getTeacherPlan(teacherId) {
  const { rows } = await query(
    `select
       t.id,
       t.plan,
       t.trial_ends_at,
       t.upgrade_requested_at,
       (select count(*)::int from classes c
         where c.teacher_id = t.id and c.archived_at is null) as class_count,
       (select count(*)::int from students s
         join classes c on c.id = s.class_id
         where c.teacher_id = t.id and c.archived_at is null) as student_count
     from teachers t
     where t.id = $1`,
    [teacherId],
  );

  const row = rows[0];
  if (!row) throw new AppError(404, "Teacher account not found.");

  const plan = normalizePlan(row.plan);
  const limits = limitsForPlan(plan);
  const trialEnd = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  const trialActive = plan === "paid" || !trialEnd || trialEnd.getTime() > Date.now();
  const daysRemaining =
    plan === "paid" || !trialEnd
      ? null
      : Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / DAY_MS));
  const classes = Number(row.class_count);
  const students = Number(row.student_count);

  return {
    plan,
    trialEndsAt: row.trial_ends_at,
    trialActive,
    trialDaysRemaining: trialActive ? daysRemaining : 0,
    upgradeRequestedAt: row.upgrade_requested_at,
    limits,
    limitsByPlan: PLAN_LIMITS,
    usage: { classes, students },
    canCreateClass: trialActive && classes < limits.maxClasses,
    contactEmail: config.billingContactEmail || null,
  };
}

export function assertTrialActive(planInfo) {
  if (!planInfo.trialActive) {
    throw new AppError(
      402,
      "Your free pilot has ended. Existing classes still work, but upgrade to create classes or add students.",
    );
  }
}

export async function assertCanCreateClass(teacherId) {
  const planInfo = await getTeacherPlan(teacherId);
  assertTrialActive(planInfo);

  if (planInfo.usage.classes >= planInfo.limits.maxClasses) {
    throw new AppError(
      402,
      `The ${planLabel(planInfo.plan)} includes up to ${planInfo.limits.maxClasses} active classes. Archive a class or upgrade for more.`,
    );
  }

  return planInfo;
}

/**
 * Restoring an archived class does not create new capacity, so it is allowed
 * after the trial ends as long as the active-class limit is not exceeded.
 */
export async function assertCanRestoreClass(teacherId) {
  const planInfo = await getTeacherPlan(teacherId);
  if (planInfo.usage.classes >= planInfo.limits.maxClasses) {
    throw new AppError(
      402,
      `The ${planLabel(planInfo.plan)} includes up to ${planInfo.limits.maxClasses} active classes. Archive a class or upgrade for more.`,
    );
  }
  return planInfo;
}

export async function assertCanAddStudents(teacherId, currentCount, additional = 1) {
  const planInfo = await getTeacherPlan(teacherId);
  assertTrialActive(planInfo);

  if (currentCount + additional > planInfo.limits.maxStudentsPerClass) {
    throw new AppError(
      402,
      `This class is limited to ${planInfo.limits.maxStudentsPerClass} students on the ${planLabel(planInfo.plan)}. Upgrade to add more.`,
    );
  }

  return planInfo;
}

/**
 * Record an upgrade request and notify the pilot operator. Requests are
 * idempotent: the first timestamp is kept, but the operator still gets a new
 * message if the teacher asks again with more context.
 */
export async function requestUpgrade(teacherId, note = "") {
  const { rows } = await query(
    `update teachers
     set upgrade_requested_at = coalesce(upgrade_requested_at, now())
     where id = $1
     returning id, email, name, upgrade_requested_at`,
    [teacherId],
  );

  const teacher = rows[0];
  if (!teacher) throw new AppError(404, "Teacher account not found.");

  if (config.billingNotifyEmail) {
    await sendMail(upgradeRequestEmail({ teacher, note })).catch((error) => {
      console.error("[MASTERY] Could not send the upgrade request email:", error.message);
    });
  } else {
    console.log(
      `[MASTERY billing] Upgrade requested by ${teacher.email} (${teacher.name})${
        note ? `: ${note}` : ""
      }`,
    );
  }

  return getTeacherPlan(teacherId);
}

/**
 * Provider-agnostic plan activation for the billing webhook. `paid` clears the
 * trial; `pilot` with no trial date expires the pilot immediately.
 */
export async function setTeacherPlanByEmail({ email, plan, trialEndsAt }) {
  const normalizedPlan = normalizePlan(plan);
  const nextTrial =
    normalizedPlan === "paid"
      ? null
      : trialEndsAt
        ? new Date(trialEndsAt).toISOString()
        : new Date().toISOString();

  const { rows } = await query(
    `update teachers
     set plan = $2,
         trial_ends_at = $3,
         upgrade_requested_at = case when $2 = 'paid' then null else upgrade_requested_at end
     where lower(email) = lower($1)
     returning id, email, name, plan, trial_ends_at, upgrade_requested_at`,
    [email, normalizedPlan, nextTrial],
  );

  const teacher = rows[0];
  if (!teacher) throw new AppError(404, "Teacher account not found.");

  return {
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
    plan: teacher.plan,
    trialEndsAt: teacher.trial_ends_at,
    upgradeRequestedAt: teacher.upgrade_requested_at,
  };
}
