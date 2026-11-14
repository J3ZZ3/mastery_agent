function normalizeMinus(value) {
  return String(value ?? "").replace(/[−–—]/g, "-");
}

function finalLine(value) {
  const raw = String(value ?? "").replace(/\r\n/g, "\n");
  if (!raw.includes("\n")) return raw;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : raw;
}

export function normalizeAnswer(value) {
  return normalizeMinus(finalLine(value)).trim().replace(/\s+/g, " ");
}

function numericEqual(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  // only treat as numeric if the whole string is a simple number form
  if (!/^[-+]?\d*\.?\d+$/.test(a) || !/^[-+]?\d*\.?\d+$/.test(b)) return false;
  return Math.abs(na - nb) < 1e-9;
}

export function isAnswerCorrect(learnerAnswer, correctAnswer) {
  const a = normalizeAnswer(learnerAnswer);
  const b = normalizeAnswer(correctAnswer);
  if (a === "" && b === "") return true;
  if (a === b) return true;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return numericEqual(a, b);
}

/**
 * Remove book/chapter/page reference prefixes the model may prepend to prompts,
 * e.g. "(Chapter 8: Algebraic expressions, p117) ..." or "(p24) ...".
 * Prompts shown to students must be the clean question only.
 */
export function sanitizeQuestionPrompt(prompt) {
  let text = String(prompt ?? "").trim();
  if (!text) return text;
  // Strip one or more leading parenthesized/bracketed refs that mention chapter/page/book refs.
  const refPattern = /^\s*[\(\[]\s*(?:chapter\b[^)\]]*|p\.?\s*\d+[^)\]]*|pp\.?\s*\d+[^)\]]*|pages?\b[^)\]]*|book\b[^)\]]*)[\)\]]\s*[:\-–—]?\s*/i;
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(refPattern, "");
    if (next === text) break;
    text = next.trim();
  }
  // Fallback: if it still starts with "(Chapter" or "(p" style, drop leading paren group.
  text = text.replace(/^\s*\((?=[^)]*(?:chapter|p\.?\s*\d+|page))[^)]*\)\s*[:\-–—]?\s*/i, "").trim();
  // Some models wrap maths in LaTeX delimiters. The student UI renders plain
  // text, so keep the expression and drop the delimiters ($...$, \(...\), \[...\]).
  // Only strip `$...$` when the content looks like maths, so currency amounts
  // in word problems (e.g. "costs $45 ... costs $12") are left intact.
  text = text
    .replace(/\$([^$]*?)\$/g, (match, inner) =>
      /[=+\-×÷^√()]/.test(inner) || /^[^A-Za-z]*$/.test(inner) ? inner : match,
    )
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .trim();
  return text;
}
