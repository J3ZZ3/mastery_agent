import { config } from "../config.js";
import { skillLabel } from "../domain/skills.js";
import { masteryQuestionsSchema, masteryResultSchema, parseWith } from "../validation/schemas.js";
import { isAnswerCorrect, sanitizeQuestionPrompt } from "../domain/answer.js";

export async function runMasteryQuestionsAgent({
  gapKey,
  attempt,
  diagnosis = null,
  report = null,
  ai,
  latencyMs = 0,
  curriculum = null,
}) {
  const focus = diagnosis?.suspectedGap || gapKey || "the diagnosed skill";
  const ref = curriculum?.relevantOutline?.[0]
    ? `${curriculum.relevantOutline[0].title}${curriculum.relevantOutline[0].page ? ` (p${curriculum.relevantOutline[0].page})` : ""}`
    : curriculum?.focusTopic?.focus || "";
  const example = {
    questions: [1, 2, 3, 4, 5].map((n) => ({
      id: `m${attempt}${n}`,
      prompt: `Fresh mastery check question ${n} on the same skill.`,
      hint: `Use the method from the learner book and the intervention steps${ref ? ` (${ref})` : ""}.`,
      skill: gapKey || "target_skill",
      correctAnswer: String(n),
      explanation: `Correct solution grounded in the book's method for this topic${ref ? ` (${ref})` : ""}.`,
    })),
    threshold: config.masteryThreshold,
  };

  const { data, meta } = await ai.generateJSON({
    schema: masteryQuestionsSchema,
    example,
    latencyMs,
    label: "Mastery Agent",
    instructions: [
      "Generate a short follow-up mastery assessment (about 5 questions) on the same underlying skill/gap, using fresh questions different from the diagnostic and prior practice. Every question must be mathematically correct with an unambiguous correctAnswer and clear explanation/hint.",
      "Ground every question in the provided syllabus/book/resource (curriculum): use relevant topic/chapter names and PDF page numbers from the provided outline, scheme focus, or excerpts, but DO NOT put chapter/topic/page references in the `prompt` field. The `prompt` must be only the clean student-facing question/problem statement.",
      "Put book/syllabus grounding and page references in `explanation` and/or `hint`. Do not invent page numbers or content not supported by the provided curriculum.",
      attempt > 1
        ? "This is an adapted retry: target the remaining difficulty/evidence while keeping the same core skill focus; vary contexts/numbers so it is not a repeat."
        : "Align questions to the diagnosed gap and the book's taught method for that topic.",
      "Set skill labels (snake_case) that reflect what each question assesses. Include the mastery threshold.",
    ].join("\n"),
    payload: { gapKey, attempt, diagnosis, report, threshold: config.masteryThreshold, curriculum },
  });

  const questions = (data.questions || []).map((q, idx) => ({
    id: q.id || `m${attempt}${idx + 1}`,
    prompt: sanitizeQuestionPrompt(q.prompt),
    hint: q.hint || "Apply the method you practised.",
    skill: q.skill || gapKey || "target_skill",
    correctAnswer: String(q.correctAnswer ?? "").trim(),
    explanation: q.explanation || "Correct solution.",
  }));

  return {
    data: {
      // The pass threshold is a product decision, never a model output.
      threshold: config.masteryThreshold,
      questions,
    },
    meta,
  };
}

export function buildMasteryResult({ questions, answers, attempt, initialScore }) {
  const evaluated = questions.map((question) => ({
    question,
    answer: String(answers[question.id] ?? "").trim(),
    correct: isAnswerCorrect(answers[question.id], question.correctAnswer),
  }));

  const correct = evaluated.filter((item) => item.correct).length;
  const total = evaluated.length;
  const scorePercent = total ? Math.round((correct / total) * 100) : 0;
  const thresholdMet = scorePercent >= config.masteryThreshold;
  const wrong = evaluated.filter((item) => !item.correct);
  const wrongSkills = [...new Set(wrong.map((item) => item.question.skill))];
  const delta = scorePercent - initialScore;

  const wrongDetail = wrong
    .slice(0, 3)
    .map((item) => `"${item.question.prompt}" (answered "${item.answer || "(no answer)"}", expected "${item.question.correctAnswer}")`)
    .join("; ");

  const remainingDifficulty = thresholdMet
    ? "No persistent difficulty was evident on this follow-up set."
    : wrong.length > 0
      ? `The follow-up still shows difficulty with ${wrongSkills.map((skill) => skillLabel(skill).toLowerCase()).join(" and ")}: ${wrongDetail}.`
      : "The follow-up did not reach the mastery threshold, but no single item could be identified as incorrect.";

  const recommendation = thresholdMet
    ? "Move on to the next topic, but keep one spaced review of the specific skills practised in this cycle."
    : attempt >= config.maxAttempts
      ? "Pause independent retries and arrange a short teacher-led review that works through the specific items still incorrect."
      : "Run one adapted intervention that directly re-teaches and practises the specific steps missed in the items above before another mastery check.";

  return parseWith(
    masteryResultSchema,
    {
      attempt,
      correct,
      total,
      scorePercent,
      thresholdMet,
      comparison: {
        initialScore,
        latestScore: scorePercent,
        delta,
      },
      remainingDifficulty,
      recommendation,
    },
    "Mastery result",
  );
}

export async function runMasteryEvaluationAgent({
  questions,
  answers,
  attempt,
  initialScore,
  ai,
  latencyMs = 0,
  curriculum = null,
}) {
  // Scores are objective; the model writes the diagnosis and recommendation.
  const groundTruth = buildMasteryResult({ questions, answers, attempt, initialScore });

  const { data, meta } = await ai.generateJSON({
    schema: masteryResultSchema,
    example: groundTruth,
    latencyMs,
    label: "Mastery Agent",
    instructions: [
      "Evaluate the follow-up assessment against the explicit threshold. Compare with the initial score. A failed attempt should identify what remains difficult, not describe the learner as failing.",
      curriculum
        ? "Learner book context is provided. Describe remaining difficulty and recommendations in relation to the book's topic/objective and cite relevant page numbers from the provided outline or excerpts. Do not invent page numbers."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    payload: { questions, answers, attempt, initialScore, threshold: config.masteryThreshold, curriculum },
  });

  return {
    data: {
      ...data,
      attempt: groundTruth.attempt,
      correct: groundTruth.correct,
      total: groundTruth.total,
      scorePercent: groundTruth.scorePercent,
      thresholdMet: groundTruth.thresholdMet,
      comparison: groundTruth.comparison,
    },
    meta,
  };
}
