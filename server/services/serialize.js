import { sanitizeQuestionPrompt } from "../domain/answer.js";

export function publicQuestion(question) {
  return {
    id: question.id,
    prompt: sanitizeQuestionPrompt(question.prompt),
    skill: question.skill,
  };
}

export function publicPracticeQuestion(question) {
  return {
    id: question.id,
    prompt: sanitizeQuestionPrompt(question.prompt),
    skill: question.skill,
    hint: question.hint,
  };
}

export function publicIntervention(intervention) {
  if (!intervention) return null;
  return {
    gapKey: intervention.gapKey,
    title: intervention.title,
    objective: intervention.objective,
    summary: intervention.summary,
    sections: intervention.sections,
    numberLine: intervention.numberLine,
    workedExamples: intervention.workedExamples,
    practiceQuestions: intervention.practiceQuestions.map((question) => publicPracticeQuestion(question)),
    recap: intervention.recap,
    adapted: intervention.adapted,
    adaptationNote: intervention.adaptationNote,
  };
}

export function serializeSession(session) {
  if (!session) return null;

  return {
    id: session.id,
    learnerId: session.learnerId,
    status: session.status,
    attempt: session.attempt,
    threshold: session.threshold,
    curriculum: session.curriculum || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastActivityAt: session.lastActivityAt,
    completedAt: session.completedAt || null,
    error: session.error || null,
    diagnostic: {
      questions: session.diagnostic.questions.map(publicQuestion),
      answers: session.diagnostic.answers,
      submittedAt: session.diagnostic.submittedAt,
      report: session.diagnostic.report
        ? {
            ...session.diagnostic.report,
            items: (session.diagnostic.report.items || []).map((item) => ({
              ...item,
              prompt: sanitizeQuestionPrompt(item.prompt),
            })),
          }
        : session.diagnostic.report,
    },
    diagnosis: session.diagnosis,
    attempts: session.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      intervention: publicIntervention(attempt.intervention),
      createdAt: attempt.createdAt,
      practice: {
        answers: attempt.practice.answers,
        startedAt: attempt.practice.startedAt,
        completedAt: attempt.practice.completedAt,
        result: attempt.practice.result,
      },
      mastery: attempt.mastery
        ? {
            questions: attempt.mastery.questions.map(publicQuestion),
            generatedAt: attempt.mastery.generatedAt,
            submittedAt: attempt.mastery.submittedAt,
            answers: attempt.mastery.answers,
            result: attempt.mastery.result,
          }
        : null,
    })),
    teacherInsight: session.teacherInsight,
    events: [...session.events].sort((a, b) => new Date(a.at) - new Date(b.at)),
  };
}

export function sessionSummary(session) {
  if (!session) return null;
  const lastAttempt = session.attempts[session.attempts.length - 1] || null;
  return {
    id: session.id,
    learnerId: session.learnerId,
    status: session.status,
    attempt: session.attempt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt || null,
    initialScore: session.diagnostic?.report?.scorePercent ?? null,
    latestScore: lastAttempt?.mastery?.result?.scorePercent ?? null,
    masteryMet: lastAttempt?.mastery?.result?.thresholdMet ?? null,
    gap: session.diagnosis?.suspectedGap ?? null,
  };
}
