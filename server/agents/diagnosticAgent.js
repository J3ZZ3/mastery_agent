import { parseWith, diagnosticSchema, diagnosticModelSchema } from "../validation/schemas.js";
import { gapLabel, skillLabel } from "../domain/skills.js";

const skillGapMap = {
  integer_addition: "negative_operations",
  integer_subtraction: "negative_operations",
  double_negative: "negative_operations",
  integer_multiplication: "integer_multiplication",
  algebra_integers: "algebra_integers",
};

function dominantSkill(wrong) {
  const counts = {};
  for (const item of wrong) counts[item.skill] = (counts[item.skill] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function relatedConceptForSkills(skills) {
  const unique = [...new Set(skills)];
  if (unique.length === 1) return skillLabel(unique[0]);
  return unique.slice(0, 3).map((skill) => skillLabel(skill)).join(", ");
}

function buildSpecificReasoning({ wrong, gapKey, isSurfaceLevel, report }) {
  const skills = wrong.map((item) => item.skill);
  const dominant = dominantSkill(wrong);
  const dominantLabel = dominant ? skillLabel(dominant).toLowerCase() : "the target skill";
  const correct = report.totalQuestions - wrong.length;
  const detail = wrong
    .map((item) => `"${item.prompt}" (answered "${item.learnerAnswer}", expected "${item.correctAnswer}")`)
    .join("; ");

  if (isSurfaceLevel) {
    return `Out of ${report.totalQuestions} items, ${correct} were correct and only 1 was incorrect: ${detail}. This suggests a possible slip or fragile understanding in ${dominantLabel} rather than a broad pattern. A focused check on this specific step would confirm whether it is a concept gap or a one-off error.`;
  }

  const otherCorrect = report.items
    .filter((item) => item.correct)
    .map((item) => skillLabel(item.skill).toLowerCase());
  const contrast = otherCorrect.length
    ? ` By contrast, items involving ${[...new Set(otherCorrect)].slice(0, 2).join(" and ")} were answered correctly.`
    : "";

  return `${wrong.length} of ${report.totalQuestions} answers were incorrect (${detail}). The mistakes cluster around ${dominantLabel}${
    skills.length > 1 ? ` and related work in ${[...new Set(skills)].map((s) => skillLabel(s).toLowerCase()).join(", ")}` : ""
  }, which suggests the learner may be insecure with the specific idea needed for these items rather than with every part of integer work.${contrast}`;
}

export function buildDiagnosis({ report, curriculum = null }) {
  const wrong = report.items.filter((item) => !item.correct);

  if (wrong.length === 0) {
    const focus = curriculum?.focusTopic?.focus;
    const pages = curriculum?.focusTopic?.pages;
    const bookRef = focus ? ` The learner appears ready to move on in the book${pages ? ` (${focus}, ${pages})` : ` (${focus})`}.` : "";
    return parseWith(
      diagnosticSchema,
      {
        gapKey: "secure",
        suspectedGap: "Secure understanding of the assessed skills",
        relatedConcept: curriculum?.focusTopic?.focus || "Extending integer reasoning into algebra",
        evidence: [
          `All ${report.totalQuestions} diagnostic items were answered correctly with no incorrect responses to analyse.`,
        ],
        confidence: 0.92,
        reasoning: `Because every submitted answer matched the expected result, there is no evidence of a current misconception in the assessed items.${bookRef}`,
        isSurfaceLevel: false,
        severity: "low",
      },
      "Diagnosis",
    );
  }

  const counts = {};
  for (const item of wrong) {
    counts[item.skill] = (counts[item.skill] || 0) + 1;
  }

  const weighted = {
    negative_operations:
      (counts.integer_subtraction || 0) + (counts.double_negative || 0) * 1.15 + (counts.integer_addition || 0) * 0.55,
    integer_multiplication: (counts.integer_multiplication || 0) * 1.1,
    algebra_integers: (counts.algebra_integers || 0) * 1.05,
  };

  let gapKey = "negative_operations";
  if (weighted.integer_multiplication > weighted[gapKey] && weighted.integer_multiplication >= weighted.algebra_integers) {
    gapKey = "integer_multiplication";
  } else if (weighted.algebra_integers > weighted[gapKey] && weighted.algebra_integers > weighted.integer_multiplication) {
    gapKey = "algebra_integers";
  }

  if (wrong.length === 1 && counts.algebra_integers === 1 && weighted.negative_operations === 0) {
    gapKey = "algebra_integers";
  }

  if (wrong.length === 1) {
    gapKey = skillGapMap[wrong[0].skill] || gapKey;
  }

  const isSurfaceLevel = wrong.length === 1;
  const evidence = wrong.map(
    (item) =>
      `${item.prompt} → answered "${item.learnerAnswer}", expected "${item.correctAnswer}". ${
        item.misconception || `The item tests ${skillLabel(item.skill).toLowerCase()}.`
      }`,
  );

  const dominantCount = Math.max(...Object.values(counts));
  const confidence = Number(
    Math.min(0.95, 0.58 + wrong.length * 0.06 + (dominantCount / wrong.length) * 0.15).toFixed(2),
  );

  const dominant = dominantSkill(wrong) || wrong[0].skill;
  const suspectedGap = isSurfaceLevel
    ? `Possible slip in ${skillLabel(dominant).toLowerCase()}`
    : `Difficulty with ${skillLabel(dominant).toLowerCase()}${wrong.length > 1 ? " in the submitted items" : ""}`;
  const relatedConcept = relatedConceptForSkills(wrong.map((item) => item.skill));
  const reasoning = buildSpecificReasoning({ wrong, gapKey, isSurfaceLevel, report });

  return parseWith(
    diagnosticSchema,
    {
      gapKey,
      suspectedGap: curriculum?.focusTopic?.focus
        ? `${suspectedGap} (${curriculum.focusTopic.focus}${curriculum.focusTopic.pages ? `, ${curriculum.focusTopic.pages}` : ""})`
        : suspectedGap,
      relatedConcept: curriculum?.relevantOutline?.[0]
        ? `${relatedConcept} — see "${curriculum.relevantOutline[0].title}"${curriculum.relevantOutline[0].page ? ` (p${curriculum.relevantOutline[0].page})` : ""}`
        : relatedConcept,
      evidence,
      confidence,
      reasoning: curriculum?.relevantOutline?.[0]
        ? `${reasoning} In the learner book, this aligns with "${curriculum.relevantOutline[0].title}"${curriculum.relevantOutline[0].page ? ` (p${curriculum.relevantOutline[0].page})` : ""}.`
        : reasoning,
      isSurfaceLevel,
      severity: wrong.length >= 3 ? "high" : wrong.length === 2 ? "moderate" : "low",
    },
    "Diagnosis",
  );
}

export async function runDiagnosticAgent({ report, ai, latencyMs = 0, curriculum = null }) {
  const example = buildDiagnosis({ report, curriculum });

  const { data, meta } = await ai.generateJSON({
    schema: diagnosticModelSchema,
    example,
    latencyMs,
    label: "Diagnostic Agent",
    instructions: [
      "Form a hypothesis, not a verdict. Your output must be SPECIFIC to the submitted answers.",
      "Do not use generic or reusable template reasoning. Explicitly name the exact questions the learner got wrong, the answer they gave, and what that specific choice suggests (use the provided misconceptions/evidence).",
      "Keep everything short enough for a Grade 8 learner to scan. Hard limits: suspectedGap max 15 words (one sentence, no chapter lists); relatedConcept max 12 words plus at most one book reference; evidence 2-3 items of max 20 words each; reasoning max 40 words.",
      "suspectedGap must name the concrete difficulty in plain words (e.g. 'subtracting decimal coefficients'). Put book/page references in relatedConcept, never in suspectedGap.",
      "evidence items must follow this shape: question -> learner answer vs correct answer -> what it suggests. Do not repeat the same sentence in reasoning.",
      "Distinguish a surface slip from a concept gap and use cautious language such as 'may' or 'suggests'. Keep gapKey, isSurfaceLevel and severity consistent with the evidence.",
      curriculum
        ? "Learner book context is provided (verified outline, scheme and page excerpts). Identify the most likely prerequisite topic/section in that book and cite its PDF page number(s) in relatedConcept or evidence. Do not invent page numbers or content not in the provided excerpts."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    payload: { report, curriculum },
  });

  // Preserve objectively derived routing/safety fields while keeping the
  // model's specific, evidence-grounded narrative.
  return {
    data: {
      ...data,
      gapKey: example.gapKey,
      isSurfaceLevel: example.isSurfaceLevel,
      severity: example.severity,
      evidence: Array.isArray(data.evidence) && data.evidence.length > 0 ? data.evidence : example.evidence,
      confidence:
        typeof data.confidence === "number" && data.confidence >= 0 && data.confidence <= 1
          ? data.confidence
          : example.confidence,
    },
    meta,
  };
}
