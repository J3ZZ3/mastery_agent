import { z } from "zod";

export const GAP_KEYS = [
  "negative_operations",
  "integer_multiplication",
  "algebra_integers",
  "surface_errors",
  "secure",
];

const idSchema = z.string().min(1);

const personName = z.string().trim().min(1).max(80);
const className = z.string().trim().min(2).max(80);
const subjectName = z.string().trim().min(1).max(80);
const gradeLevel = z.number().int().min(1).max(12).nullable();

export const requestSchemas = {
  teacherSignup: z.object({
    email: z.string().trim().email().max(200),
    name: personName,
    password: z.string().min(8).max(200),
  }),
  teacherLogin: z.object({
    email: z.string().trim().email().max(200),
    password: z.string().min(1).max(200),
  }),
  teacherForgotPassword: z.object({
    email: z.string().trim().email().max(200),
  }),
  teacherResetPassword: z.object({
    token: z.string().trim().min(20).max(300),
    password: z.string().min(8).max(200),
  }),
  teacherVerifyEmail: z.object({
    token: z.string().trim().min(20).max(300),
  }),
  importStudents: z.object({
    csv: z.string().trim().min(1).max(20_000),
  }),
  studentLogin: z.object({
    joinCode: z
      .string()
      .trim()
      .min(4)
      .max(12)
      .regex(/^[A-Za-z0-9]+$/, "Use the class code your teacher gave you."),
    displayName: personName,
    pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
  }),
  createClass: z.object({
    name: className,
    subject: subjectName.optional().default("Mathematics"),
    grade: gradeLevel.optional().default(null),
    // The teacher must attest that they have the school/guardian permission
    // needed to create accounts for minors before a class can be created.
    consentAttested: z.literal(true, {
      errorMap: () => ({
        message:
          "Confirm that you have permission to create student accounts and that you have shared the privacy notice.",
      }),
    }),
  }),
  confirmPermanentDelete: z.object({
    confirm: z.literal(true, {
      errorMap: () => ({ message: "Permanent deletion must be confirmed explicitly." }),
    }),
  }),
  updateClass: z
    .object({
      name: className,
      subject: subjectName,
      grade: gradeLevel,
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: "Provide at least one field to update.",
    }),
  addStudent: z.object({
    displayName: personName,
  }),
  createSession: z.object({
    learnerId: idSchema,
    restart: z.boolean().optional().default(false),
  }),
  startClassroomSession: z.object({
    restart: z.boolean().optional().default(false),
  }),
  diagnostic: z.object({
    answers: z.record(z.string().min(1)),
  }),
  practiceCheck: z.object({
    questionId: idSchema,
    answer: z.string().min(1),
  }),
  practice: z.object({
    answers: z.record(z.string().min(1)),
  }),
  mastery: z.object({
    answers: z.record(z.string().min(1)),
  }),
};

export const assessmentReportSchema = z.object({
  totalQuestions: z.number().int().nonnegative(),
  correctAnswers: z.number().int().nonnegative(),
  incorrectAnswers: z.number().int().nonnegative(),
  scorePercent: z.number().min(0).max(100),
  identifiedPatterns: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  items: z.array(
    z.object({
      questionId: z.string().min(1),
      prompt: z.string().min(1),
      learnerAnswer: z.string().min(1),
      correctAnswer: z.string().min(1),
      correct: z.boolean(),
      skill: z.string().min(1),
      explanation: z.string().min(1),
      misconception: z.string().nullable(),
    }),
  ),
});

export const diagnosticSchema = z.object({
  gapKey: z.enum(GAP_KEYS),
  suspectedGap: z.string().min(1),
  relatedConcept: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  isSurfaceLevel: z.boolean(),
  severity: z.enum(["low", "moderate", "high"]),
});

/**
 * Model-facing variant of `diagnosticSchema`.
 *
 * `gapKey`, `severity` and `confidence` are routing/safety fields that the
 * orchestrator anchors in code from the objectively graded report. Models
 * regularly invent their own category labels (e.g. gapKey
 * "decimal_arithmetic" or severity "medium"), so requiring the strict enum in
 * the model response makes otherwise good evidence fail validation. The
 * narrative fields stay strict; the routing fields are relaxed here and
 * overwritten with the code-derived values after the call.
 */
export const diagnosticModelSchema = diagnosticSchema.extend({
  gapKey: z.string().min(1),
  severity: z.string().min(1),
  confidence: z.number(),
  evidence: z.array(z.string()),
});

const numberLineSchema = z.object({
  title: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  markers: z.array(
    z.object({
      value: z.number(),
      label: z.string().min(1),
      tone: z.enum(["neutral", "mint", "amber", "sky"]).optional().default("neutral"),
    }),
  ),
  arrows: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      label: z.string().min(1),
      tone: z.enum(["mint", "amber", "sky"]).optional().default("sky"),
    }),
  ),
});

const practiceQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  hint: z.string().min(1),
  skill: z.string().min(1),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
});

export const interventionSchema = z.object({
  gapKey: z.enum(GAP_KEYS),
  title: z.string().min(1),
  objective: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    }),
  ),
  numberLine: numberLineSchema.nullable(),
  workedExamples: z.array(
    z.object({
      title: z.string().min(1),
      steps: z.array(z.string().min(1)).min(1),
      answer: z.string().min(1),
    }),
  ),
  practiceQuestions: z.array(practiceQuestionSchema).min(1),
  recap: z.string().min(1),
  adapted: z.boolean(),
  adaptationNote: z.string().nullable(),
});

/**
 * Model-facing variant: `gapKey` is code-anchored to the diagnosis, so the
 * model may return any label without failing the whole intervention.
 */
export const interventionModelSchema = interventionSchema.extend({
  gapKey: z.string().min(1),
});

export const tutorResultSchema = z.object({
  total: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  scorePercent: z.number().min(0).max(100),
  results: z.array(
    z.object({
      questionId: z.string().min(1),
      prompt: z.string().min(1),
      learnerAnswer: z.string().min(1),
      correctAnswer: z.string().min(1),
      correct: z.boolean(),
      feedback: z.string().min(1),
      explanation: z.string().min(1),
    }),
  ),
  feedbackSummary: z.string().min(1),
  needsReteach: z.boolean(),
  nextFocus: z.string().min(1),
});

export const masteryQuestionsSchema = z.object({
  questions: z.array(practiceQuestionSchema).min(1),
  threshold: z.number().min(0).max(100),
});

export const diagnosticQuestionsSchema = z.object({
  questions: z.array(practiceQuestionSchema).min(3).max(8),
});

export const masteryResultSchema = z.object({
  attempt: z.number().int().positive(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  scorePercent: z.number().min(0).max(100),
  thresholdMet: z.boolean(),
  comparison: z.object({
    initialScore: z.number().min(0).max(100),
    latestScore: z.number().min(0).max(100),
    delta: z.number(),
  }),
  remainingDifficulty: z.string().min(1),
  recommendation: z.string().min(1),
});

export const teacherInsightSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  recommendation: z.string().min(1),
  nextStep: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export function parseWith(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${label} validation failed: ${details}`);
  }
  return result.data;
}
