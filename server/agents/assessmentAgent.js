import { assessmentReportSchema, diagnosticQuestionsSchema, parseWith } from "../validation/schemas.js";
import { skillLabel } from "../domain/skills.js";
import { isAnswerCorrect, normalizeAnswer, sanitizeQuestionPrompt } from "../domain/answer.js";

const patternForSkill = {
  integer_addition: "Adding integers with different signs is inconsistent.",
  integer_subtraction: "Sign errors appear when moving left from a negative number.",
  double_negative: "Subtracting a negative is being treated as ordinary subtraction.",
  integer_multiplication: "The sign rule for multiplying integers is not yet consistent.",
  algebra_integers: "Inverse operations with negative terms are not yet secure.",
};

export function buildAssessmentReport({ questions, answers }) {
  const items = questions.map((question) => {
    const learnerAnswerRaw = String(answers[question.id] ?? "").trim();
    const correct = isAnswerCorrect(learnerAnswerRaw, question.correctAnswer);
    const key = normalizeAnswer(learnerAnswerRaw);
    const misconception = correct
      ? null
      : question.misconceptions?.[learnerAnswerRaw] ||
        question.misconceptions?.[key] ||
        `The learner's answer does not match the expected result for ${skillLabel(question.skill).toLowerCase()}.`;

    return {
      questionId: question.id,
      prompt: question.prompt,
      learnerAnswer: learnerAnswerRaw || "(no answer)",
      correctAnswer: String(question.correctAnswer),
      correct,
      skill: question.skill,
      explanation: question.explanation,
      misconception,
    };
  });

  const incorrect = items.filter((item) => !item.correct);
  const correctAnswers = items.length - incorrect.length;
  const wrongSkills = [...new Set(incorrect.map((item) => item.skill))];

  const identifiedPatterns = wrongSkills.map((skill) => patternForSkill[skill] || `Errors cluster around ${skillLabel(skill)}.`);

  if (incorrect.length >= 3 && wrongSkills.length >= 2) {
    identifiedPatterns.push("Errors recur across several integer operations rather than in one isolated calculation.");
  }

  const confidence = Number(
    Math.min(0.95, 0.55 + incorrect.length * 0.07 + (wrongSkills.length === 1 && incorrect.length > 1 ? 0.08 : 0)).toFixed(2),
  );

  return parseWith(
    assessmentReportSchema,
    {
      totalQuestions: items.length,
      correctAnswers,
      incorrectAnswers: incorrect.length,
      scorePercent: items.length ? Math.round((correctAnswers / items.length) * 100) : 0,
      identifiedPatterns,
      confidence,
      items,
    },
    "Assessment report",
  );
}

export async function runAssessmentAgent({ questions, answers, ai, latencyMs = 0, curriculum = null }) {
  // Correctness is objective, so it is computed here as ground truth. The model
  // reasons about the error patterns and confidence; it cannot override scores.
  const groundTruth = buildAssessmentReport({ questions, answers });

  const { data, meta } = await ai.generateJSON({
    schema: assessmentReportSchema,
    example: groundTruth,
    latencyMs,
    label: "Assessment Agent",
    instructions: [
      "Evaluate every answer. A pattern must be grounded in the submitted answers. Confidence is about the evidence, not about the learner.",
      curriculum
        ? "Curriculum context from the learner book is provided. When relevant, relate error patterns to the book's topics and cite PDF page numbers (e.g. p24) from the provided outline/excerpts. Do not invent page numbers."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    payload: { questions, answers, curriculum },
  });

  return {
    data: {
      ...data,
      totalQuestions: groundTruth.totalQuestions,
      correctAnswers: groundTruth.correctAnswers,
      incorrectAnswers: groundTruth.incorrectAnswers,
      scorePercent: groundTruth.scorePercent,
      items: groundTruth.items,
    },
    meta,
  };
}
export async function runDiagnosticQuestionsAgent({ learner, curriculum, ai, latencyMs = 0 }) {
  const focus = curriculum?.focusTopic?.focus || (learner?.subject ? `${learner.subject} algebra` : "Algebra");
  const pages = curriculum?.focusTopic?.pages || "";
  const example = {
    questions: [
      {
        id: "d1",
        prompt: "Solve an algebra problem from this topic. Show the final answer.",
        hint: `Use the method shown in the learner book for ${focus}${pages ? ` (${pages})` : ""}.`,
        skill: "algebraic_understanding",
        correctAnswer: "x=2",
        explanation: `Worked algebra solution grounded in ${focus}${pages ? `, ${pages}` : ""} in the learner book.`,
      },
      {
        id: "d2",
        prompt: "Simplify the algebraic expression.",
        hint: `Follow the steps from the relevant worked example in the book (${focus}${pages ? `, ${pages}` : ""}).`,
        skill: "algebraic_manipulation",
        correctAnswer: "3x+2",
        explanation: `Correct answer derived from the referenced algebra method in ${focus}${pages ? `, ${pages}` : ""}.`,
      },
      {
        id: "d3",
        prompt: "Solve the equation.",
        hint: `Apply inverse operations as shown in the book (${focus}${pages ? `, ${pages}` : ""}).`,
        skill: "solving_equations",
        correctAnswer: "5",
        explanation: `Step-by-step reasoning aligned to ${focus}${pages ? `, ${pages}` : ""}.`,
      },
      {
        id: "d4",
        prompt: "Answer the algebra question, showing your reasoning.",
        hint: `Review the key algebra rule in ${focus}${pages ? `, ${pages}` : ""}.`,
        skill: "algebra_misconception",
        correctAnswer: "4",
        explanation: `Addresses a common algebra error described in ${focus}${pages ? `, ${pages}` : ""}.`,
      },
      {
        id: "d5",
        prompt: "Solve the algebra problem and give the final answer.",
        hint: `Use the book's algebra method for ${focus}${pages ? ` (${pages})` : ""} and verify your final answer.`,
        skill: "algebra_fluency",
        correctAnswer: "7",
        explanation: `Confirms understanding of ${focus}${pages ? `, ${pages}` : ""}.`,
      },
    ],
  };

  const { data, meta } = await ai.generateJSON({
    schema: diagnosticQuestionsSchema,
    example,
    latencyMs,
    label: "Assessment Agent",
    instructions: [
      "Generate 5 short diagnostic questions for the learner focused ONLY on algebra topics from the provided syllabus/book/resource (curriculum). Do not generate questions on non-algebra topics (e.g. whole numbers properties, factors/multiples, ratio/rate, profit/percentages, geometry, data handling) unless the provided book context is strictly algebra-only.",
      "Each question must be fresh (not reused templates), mathematically correct, and have an unambiguous correctAnswer and a clear explanation. Prompts should be answerable by typing a final answer (and optional working on separate lines).",
      "Every question must be grounded in the provided syllabus/book/resource (use curriculum.outline, scheme, focusTopic, relevantOutline, relevantPages/excerpts and cite their algebra topic/chapter and PDF page numbers), but NEVER put chapter/topic/page references in the `prompt` field. The `prompt` must be only the clean student-facing question/problem statement (no '(Chapter ...)', '(p..)', book names, or page refs).",
      "Put the book/syllabus grounding and page references in `explanation` and/or `hint` (e.g. refer to the relevant topic and p.. from the provided curriculum). Do not invent page numbers, chapters, or content not supported by the provided curriculum.",
      "Select algebra content from curriculum.relevantOutline, curriculum.outline, curriculum.scheme, and curriculum.focusTopic. Vary algebra skills (e.g. expressions, simplification, substitution, solving equations, patterns/formulas) to reveal understanding and misconceptions.",
      curriculum
        ? "Use curriculum.book, curriculum.scheme, curriculum.focusTopic, curriculum.relevantOutline, and curriculum.relevantPages/excerpts as the ground truth. Stay within the algebra topics/pages present in this curriculum context."
        : "No analyzed learner book is available; generate Grade-appropriate algebra diagnostic questions and clearly state the algebra topic.",
    ].join("\n"),
    payload: {
      learner,
      curriculum,
      count: 5,
      focusArea: "algebra",
      requiredTopics: ["algebra", "algebraic expressions", "equations", "formulas/patterns where algebraic"],
    },
  });

  const cleaned = {
    ...data,
    questions: (data.questions || []).map((q) => ({
      ...q,
      prompt: sanitizeQuestionPrompt(q.prompt),
    })),
  };

  return { data: cleaned, meta };
}
