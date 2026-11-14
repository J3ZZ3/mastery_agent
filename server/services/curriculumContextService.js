import { query } from "../db/postgres.js";
import { gapLabel, skillLabel } from "../domain/skills.js";
import { getResourceDocument } from "./planService.js";

const MAX_OUTLINE = 60;
const MAX_PAGE_TEXT = 900;
const MAX_PAGES = 4;

const tokenize = (text) =>
  String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);

const uniqBy = (items, keyFn) => {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

/**
 * Resolve the teacher who owns a student's class.
 */
async function getTeacherIdForClass(classId) {
  if (!classId) return null;
  const { rows } = await query(
    "select teacher_id from classes where id = $1 limit 1",
    [classId],
  );
  return rows[0]?.teacher_id || null;
}

/**
 * Load the latest completed syllabus analysis for the learner book, if any.
 * This gives us the verified scheme (terms/weeks/focus/pages) produced by the
 * Scout/Architect/Verifier/Planner pipeline.
 */
async function getLatestBookAnalysis(teacherId) {
  const { rows } = await query(
    `select result, slot
       from agent_runs
      where teacher_id = $1
        and slot = 'student-book'
        and status = 'complete'
      order by created_at desc
      limit 1`,
    [teacherId],
  );
  return rows[0]?.result || null;
}

function pickFocusTopic(scheme, outline, { preferTerms = [] } = {}) {
  const wants = (preferTerms || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const matchesWanted = (text) => {
    const lower = String(text || "").toLowerCase();
    return wants.length === 0 || wants.some((term) => lower.includes(term));
  };

  const weeks = (scheme?.terms || []).flatMap((term) =>
    (term.weeks || []).map((week) => ({ ...week, term: term.term })),
  );
  if (weeks.length > 0) {
    const picked = (wants.length ? weeks.find((w) => matchesWanted(w.focus)) : null) || weeks[0];
    return {
      focus: picked.focus,
      pages: picked.pages,
      week: picked.week,
      term: picked.term,
      assessment: picked.assessment,
    };
  }

  const candidates = (outline || []).filter((entry) => entry.level <= 2);
  const picked = (wants.length ? candidates.find((entry) => matchesWanted(entry.title)) : null) || candidates[0] || outline?.[0];
  if (!picked) return null;
  return {
    focus: picked.title,
    pages: `p${picked.page}`,
    week: 1,
    term: "Term 1",
    assessment: "Short mastery check on the topic.",
  };
}

function selectRelevantOutline(outline = [], { focus, gapKey, diagnosis, preferTerms = [] }) {
  const wants = (preferTerms || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const terms = tokenize(
    [focus, diagnosis?.suspectedGap, diagnosis?.relatedConcept, gapLabel(gapKey), ...(preferTerms || [])].join(" "),
  );

  const scored = (outline || []).map((entry, index) => {
    const text = String(entry.title || "").toLowerCase();
    let score = entry.level === 1 ? 0.2 : entry.level === 2 ? 0.4 : 0.1;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
    }
    if (wants.some((w) => text.includes(w))) score += 2;
    return { ...entry, _score: score, _index: index };
  });

  const matched = scored
    .filter((entry) => entry._score >= 1)
    .sort((a, b) => b._score - a._score || a.page - b.page)
    .slice(0, 12)
    .map(({ _score, _index, ...entry }) => entry);

  const preferred = wants.length
    ? scored.filter((e) => wants.some((w) => String(e.title || "").toLowerCase().includes(w)))
        .sort((a, b) => b._score - a._score || a.page - b.page)
        .slice(0, 12)
        .map(({ _score, _index, ...entry }) => entry)
    : [];

  const base = preferred.length > 0 ? preferred : matched.length > 0 ? matched : (outline || []).slice(0, 12);
  return uniqBy(base, (entry) => `${entry.page}:${entry.title}`).slice(0, 12);
}

function selectRelevantPages(document, { focus, outlineEntries, diagnosis, gapKey, preferTerms = [] }) {
  const pages = document.pages || [];
  if (pages.length === 0) return [];

  const wanted = new Set(
    (outlineEntries || [])
      .flatMap((entry) => [entry.page, entry.page + 1, entry.page + 2])
      .filter((page) => page >= 1),
  );

  const wants = (preferTerms || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const terms = tokenize(
    [
      focus,
      diagnosis?.suspectedGap,
      diagnosis?.relatedConcept,
      ...(outlineEntries || []).map((e) => e.title),
      gapLabel(gapKey),
      ...(preferTerms || []),
    ].join(" "),
  );

  const scored = pages
    .map((page) => {
      const text = String(page.text || "");
      const lower = text.toLowerCase();
      let score = wanted.has(page.page) ? 2 : 0;
      for (const term of terms) {
        if (lower.includes(term)) score += 1;
      }
      if (wants.some((w) => lower.includes(w))) score += 2;
      if (text.trim().length < 40) score -= 1;
      return {
        page: page.page,
        score,
        text: text.slice(0, MAX_PAGE_TEXT),
      };
    })
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, MAX_PAGES);

  if (scored.length > 0) return scored.map(({ score, ...page }) => page);

  // Fallback: first couple of content pages.
  return pages.slice(0, 2).map((page) => ({
    page: page.page,
    text: String(page.text || "").slice(0, MAX_PAGE_TEXT),
  }));
}

/**
 * Build curriculum context for a classroom learner from their teacher's
 * verified learner-book analysis. This is best-effort: if there is no uploaded
 * book or no class linkage, return null so the learning cycle continues with
 * its default behaviour.
 */
export async function getCurriculumContextForLearner(learner, options = {}) {
  if (!learner?.classId) return null;

  try {
    const teacherId = await getTeacherIdForClass(learner.classId);
    if (!teacherId) return null;

    const analysis = await getLatestBookAnalysis(teacherId);
    const outline = Array.isArray(analysis?.outline) ? analysis.outline : [];
    const scheme = analysis?.scheme || null;

    let document = null;
    try {
      document = await getResourceDocument(teacherId, "student-book");
    } catch {
      document = null;
    }

    const effectiveOutline =
      outline.length > 0 ? outline : Array.isArray(document?.outline) ? document.outline : [];
    if (effectiveOutline.length === 0 && !document) return null;

    const preferTerms = Array.isArray(options.preferTerms) ? options.preferTerms : [];
    const focusTopic = pickFocusTopic(scheme, effectiveOutline, { preferTerms });
    const relevantOutline = selectRelevantOutline(effectiveOutline, {
      focus: focusTopic?.focus,
      gapKey: options.gapKey,
      diagnosis: options.diagnosis,
      preferTerms,
    });
    const relevantPages = document
      ? selectRelevantPages(document, {
          focus: focusTopic?.focus,
          outlineEntries: relevantOutline,
          diagnosis: options.diagnosis,
          gapKey: options.gapKey,
          preferTerms,
        })
      : [];

    const summaryOutline = effectiveOutline.slice(0, MAX_OUTLINE).map((entry) => ({
      title: entry.title,
      level: entry.level,
      page: entry.page,
    }));

    return {
      source: "learner-book",
      book: document
        ? { name: document.name, pageCount: document.pageCount }
        : null,
      scheme: scheme
        ? {
            summary: scheme.summary,
            terms: (scheme.terms || []).slice(0, 4).map((term) => ({
              term: term.term,
              weeks: (term.weeks || []).slice(0, 10),
            })),
          }
        : null,
      focusTopic,
      outline: summaryOutline,
      relevantOutline,
      relevantPages,
      preferredTopics: preferTerms,
      note:
        "Use this as the curriculum ground truth. When teaching, assessing or giving feedback, refer to the book's topic names and PDF page numbers (e.g. p24). Do not invent page numbers or content not supported by the provided excerpts.",
    };
  } catch {
    // Curriculum grounding is best-effort; never block the learning cycle.
    return null;
  }
}

/**
 * Refine curriculum context once a diagnosis is known so later agents
 * (designer, tutor, mastery, insight) focus on the diagnosed gap/topic.
 */
export async function getCurriculumContextForSession(session, store, options = {}) {
  const learner = await store.findLearner(session.learnerId);
  if (!learner) return session.curriculum || null;
  return getCurriculumContextForLearner(learner, {
    gapKey: options.gapKey || session.diagnosis?.gapKey,
    diagnosis: options.diagnosis || session.diagnosis,
    preferTerms: options.preferTerms || session.curriculum?.preferredTopics || [],
  });
}

export function describeCurriculum(curriculum) {
  if (!curriculum) return null;
  const focus = curriculum.focusTopic?.focus || curriculum.relevantOutline?.[0]?.title;
  const pages = curriculum.focusTopic?.pages;
  return [focus, pages].filter(Boolean).join(" · ") || "Learner book";
}