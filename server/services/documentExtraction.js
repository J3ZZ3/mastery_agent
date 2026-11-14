/**
 * Turn an uploaded learner book or teacher's guide into structured text.
 *
 * PDFs are parsed with PDF.js (pdfjs-dist), which exposes text page by page,
 * so every detected topic keeps the PDF page number it came from. DOCX files
 * are parsed with mammoth (text only, no fixed pagination). Plain text and
 * Markdown are decoded directly.
 *
 * Outline strategy, in order of preference:
 *   1. Read the book's own table of contents. A real textbook lists chapters
 *      and sections with page numbers, which is exactly the practical map a
 *      teacher needs. Printed page numbers are reconciled with PDF pages.
 *   2. If there is no table of contents, fall back to scanning body pages for
 *      heading-shaped lines. That scan is deliberately strict: exercise
 *      questions, running headers, maths fragments and publisher text are
 *      rejected so the outline stays short and usable.
 *
 * The outline is produced locally from the book's own contents pages, with a
 * strict body scan when no contents list exists. The multi-agent pipeline in
 * `server/agents/syllabusAgents.js` then reads the document and verifies every
 * page reference.
 */

const MAX_OUTLINE_ENTRIES = 150;
const HEADING_MAX_LENGTH = 90;
const MAX_HEADING_WORDS = 14;

/** "Chapter 1: Whole numbers ....... 12" (dot leaders before a page number). */
const LEADER_PATTERN = /^(.{2,140}?)[\s.·…]{3,}\s*(\d{1,4})\s*$/;
const CHAPTER_LABEL_PATTERN = /^chapter\s+(\d+)\s*:?\s*$/i;
const CHAPTER_OPENING_PATTERN = /^chapter\s+(\d+)$/i;
const SECTION_PATTERN = /^(\d{1,2})\.(\d{1,2})\b/;
const BULLET_PATTERN = /^[•*·\-–—]\s*/;

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

const median = (numbers) => {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const looksLikePageNumber = (text) =>
  /^[\s\-–—]*(\d{1,4}|[ivxlcdm]{1,7})[\s\-–—]*$/i.test(text);

const capitalizeAfterNumber = (title) =>
  title.replace(/^(\d+(?:\.\d+)+)\s+([a-z])/, (_, number, letter) => {
    return `${number} ${letter.toUpperCase()}`;
  });

const cleanTitle = (text) => {
  const cleaned = normalize(
    text
      .replace(/^[\s\-–—•*·]+/, "")
      .replace(/[\s:;.,-]+$/, ""),
  );
  if (!cleaned) return "";
  return capitalizeAfterNumber(cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
};

const joinRow = (items) => {
  let output = "";
  let previous = null;
  for (const item of items) {
    if (previous) {
      const gap = item.x - (previous.x + (previous.width || 0));
      if (gap > Math.max(1, item.size * 0.15)) output += " ";
    }
    output += item.text;
    previous = item;
  }
  return normalize(output);
};

/** Group PDF text items into visual rows so headings can be recognised. */
const groupPdfRows = (items) => {
  const rows = [];

  for (const item of items) {
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const size = Math.abs(item.transform?.[3]) || item.height || 10;
    const tolerance = Math.max(2, size * 0.4);

    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, width: item.width || 0, text: item.str, size });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      return {
        text: joinRow(row.items),
        size: Math.max(...row.items.map((item) => item.size)),
        y: row.y,
      };
    })
    .filter((row) => row.text);
};

/* ------------------------------------------------------------------ *
 * 1. Reading the book's own table of contents
 * ------------------------------------------------------------------ */

/**
 * A contents page is a page that lists several dotted-leader lines ending in
 * page numbers, and that is either titled "Contents" or is a chapter/term
 * opening page. Body pages never look like this.
 */
const looksLikeContentsPage = (page) => {
  const leaderRows = page.rows.filter((row) => LEADER_PATTERN.test(row.text));
  if (leaderRows.length === 0) return false;

  const hasContentsTitle = page.rows.some((row) =>
    /^(table of contents|contents)$/i.test(row.text),
  );
  const hasOpeningHeading = page.rows.some(
    (row) =>
      row.size >= 20 &&
      (/^chapter\s+\d+\s*:?\s*$/i.test(row.text) ||
        /^term\s+\d+\s*$/i.test(row.text)),
  );

  return hasContentsTitle || hasOpeningHeading;
};

/**
 * Pull { title, printedPage } pairs out of one contents page.
 *
 * Some books put "Chapter 1:" on its own line above the title, so a pending
 * chapter label is carried onto the next leader line.
 */
const parseContentsRows = (page) => {
  const entries = [];
  let pendingChapter = null;

  for (const row of page.rows) {
    const label = row.text.match(CHAPTER_LABEL_PATTERN);
    if (label && row.size >= 14) {
      pendingChapter = Number(label[1]);
      continue;
    }

    const match = row.text.match(LEADER_PATTERN);
    if (!match) continue;

    const rawTitle = match[1].trim();
    const bullet = BULLET_PATTERN.test(rawTitle);
    let title = cleanTitle(rawTitle);
    const printedPage = Number(match[2]);

    if (!title || !Number.isFinite(printedPage)) {
      pendingChapter = null;
      continue;
    }

    const sectionMatch = title.match(SECTION_PATTERN);
    const isSection = Boolean(sectionMatch);

    if (isSection) {
      title = capitalizeAfterNumber(title);
      pendingChapter = null;
    } else if (pendingChapter !== null) {
      title = `Chapter ${pendingChapter}: ${title}`;
      pendingChapter = null;
    }

    entries.push({
      title,
      printedPage,
      isSection,
      bullet,
      chapterNumber: sectionMatch ? Number(sectionMatch[1]) : null,
    });
  }

  return entries;
};

/**
 * Chapter opening pages use a large "Chapter 1" line followed by the chapter
 * title. They give the exact PDF page of every chapter, which is more reliable
 * than any printed page number.
 */
const collectChapterOpeners = (pages) => {
  const openers = [];

  for (const page of pages) {
    const rows = page.rows;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.size < 20) continue;
      const match = row.text.match(CHAPTER_OPENING_PATTERN);
      if (!match) continue;

      const titleParts = [];
      for (let next = index + 1; next < rows.length; next += 1) {
        const candidate = rows[next];
        if (candidate.size < 28) break;
        if (CHAPTER_OPENING_PATTERN.test(candidate.text)) break;
        titleParts.push(candidate.text);
        if (titleParts.length >= 3) break;
      }

      const title = normalize(titleParts.join(" "));
      if (!title) continue;

      openers.push({
        number: Number(match[1]),
        title,
        page: page.page,
      });
    }
  }

  return openers;
};

/**
 * Printed page numbers in a textbook rarely equal PDF page indices (covers and
 * front matter shift them). Estimate the difference once and reuse it.
 */
const detectPageOffset = (pages, chapterOpeners, tocChapters) => {
  const votes = [];
  for (const opener of chapterOpeners) {
    const tocEntry = tocChapters.get(opener.number);
    if (tocEntry) votes.push(opener.page - tocEntry.printedPage);
  }
  if (votes.length >= 2) return Math.round(median(votes));

  // Fallback: the running header often ends with the printed page number,
  // e.g. "CHAPTER 3: FRACTIONS 41".
  const headerVotes = [];
  for (const page of pages) {
    for (const row of page.rows) {
      const match = row.text.match(
        /^(?:chapter|unit|module)\s+\d+\s*:.*?(\d{1,3})$/i,
      );
      if (!match) continue;
      const printed = Number(match[1]);
      if (printed > 0 && Math.abs(page.page - printed) < 40) {
        headerVotes.push(page.page - printed);
      }
      break;
    }
  }
  if (headerVotes.length >= 3) return Math.round(median(headerVotes));

  return votes.length > 0 ? Math.round(median(votes)) : 0;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Small printed/PDF drift is possible between chapters. If the estimated page
 * does not start with the section number, check the neighbouring pages.
 */
const snapSectionPage = (pages, target, sectionNumber) => {
  if (!sectionNumber) return target;
  const pattern = new RegExp(`^${escapeRegExp(sectionNumber)}(?!\\d)`);

  for (const delta of [0, 1, -1, 2, -2]) {
    const page = pages.find((candidate) => candidate.page === target + delta);
    if (!page) continue;
    if (page.rows.some((row) => pattern.test(row.text))) return page.page;
  }

  return target;
};

const buildOutlineFromContents = (pages, pageCount) => {
  const contentsPages = pages.filter(looksLikeContentsPage);
  if (contentsPages.length === 0) {
    return { outline: [], tocEntries: [] };
  }

  const tocChapters = new Map();
  const sections = [];
  const extras = [];
  const tocEntries = [];

  for (const page of contentsPages) {
    for (const entry of parseContentsRows(page)) {
      tocEntries.push({
        title: entry.title,
        printedPage: entry.printedPage,
        tocPage: page.page,
      });

      if (entry.isSection) {
        sections.push(entry);
        continue;
      }
      if (entry.bullet) continue;
      if (/^(revision|assessment)$/i.test(entry.title)) continue;

      const chapterMatch = entry.title.match(/^chapter\s+(\d+)\s*:\s*(.+)$/i);
      if (chapterMatch) {
        tocChapters.set(Number(chapterMatch[1]), entry);
      } else {
        extras.push(entry);
      }
    }
  }

  const chapterOpeners = collectChapterOpeners(pages);
  const offset = detectPageOffset(pages, chapterOpeners, tocChapters);
  const limit = Math.max(pageCount || 0, ...pages.map((page) => page.page));

  const chapters = new Map();
  for (const opener of chapterOpeners) {
    const tocEntry = tocChapters.get(opener.number);
    const title = tocEntry?.title || `Chapter ${opener.number}: ${opener.title}`;
    chapters.set(opener.number, { title, level: 1, page: opener.page });
  }
  // Chapters without a recognisable opening page fall back to the TOC page.
  for (const [number, entry] of tocChapters) {
    if (chapters.has(number)) continue;
    const page = entry.printedPage + offset;
    if (page < 1 || page > limit) continue;
    chapters.set(number, { title: entry.title, level: 1, page });
  }

  const outline = [];
  for (const chapter of chapters.values()) {
    outline.push({ ...chapter, order: 0 });
  }

  for (const entry of sections) {
    const page = entry.printedPage + offset;
    if (page < 1 || page > limit) continue;
    const sectionNumber = entry.title.match(SECTION_PATTERN)?.[0];
    outline.push({
      title: entry.title,
      level: 2,
      page: snapSectionPage(pages, page, sectionNumber),
      order: 1,
    });
  }

  for (const entry of extras) {
    const page = entry.printedPage + offset;
    if (page < 1 || page > limit) continue;
    outline.push({ title: entry.title, level: 1, page, order: 0 });
  }

  const seen = new Set();
  const deduped = [];
  for (const entry of outline) {
    const key = `${entry.level}:${entry.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  deduped.sort(
    (a, b) => a.page - b.page || a.order - b.order || a.level - b.level,
  );

  return {
    outline: deduped
      .slice(0, MAX_OUTLINE_ENTRIES)
      .map(({ order, ...entry }) => entry),
    tocEntries,
  };
};

/* ------------------------------------------------------------------ *
 * 2. Strict body scan for books without a table of contents
 * ------------------------------------------------------------------ */

const NOISE_PATTERNS = [
  /^mathematics\b/i,
  /\bgrade\s*\d/i,
  /\bcaps\b/i,
  /learner book|teacher'?s guide/i,
  /developed and funded|ukuqonda|sasol inzalo/i,
  /creative commons|isbn|copyright|published by|neale street/i,
  /table of contents/i,
  /^term\s+\d+$/i,
  /^chapter$/i,
  /^book\s*\d/i,
  /^term\s+\d+\s*:/i,
];

const looksLikeNoise = (text) => {
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return true;

  // Running headers such as "CHAPTER 1: WHOLE NUMBERS 3": the part after the
  // chapter label is all capitals and ends in the printed page number.
  const headerMatch = text.match(/^(?:chapter|unit|module)\s+\d+\s*:/i);
  if (headerMatch) {
    const tail = text.slice(headerMatch[0].length);
    if (!/[a-z]/.test(tail) && /\d\s*$/.test(tail)) return true;
  }

  // Exercise questions: "1. (a) ...", "(b) ...", "3. Is there ...".
  if (/^\(?[a-z]\)\s/i.test(text)) return true;
  if (/^\d+\.\s*\(?[a-z]?\)?/i.test(text) && !/^\d+\.\d/.test(text)) return true;
  if (/^\d+\.\s/.test(text)) return true;

  // Maths fragments: "21 + 25 = 46", "3 758 3", "5 10 3 7 π".
  if (/[=+×÷%<>]/.test(text)) return true;
  if (/^[\d\s.,:;+\-–—()/π]+$/.test(text)) return true;
  if (/^R\s?\d/.test(text)) return true;

  // Sentences, not headings.
  if (/[.;:,]$/.test(text)) return true;
  if (text.split(/\s+/).length > MAX_HEADING_WORDS) return true;

  return false;
};

const chapterPattern = /^(chapter|unit|module|theme|part)\s+([0-9]+|[ivxlcdm]+)\b/i;
const numberedPattern = /^(\d+(?:\.\d+){1,3})\s+(\S.*)$/;

const detectBodyOutline = (pages) => {
  const allRows = pages.flatMap((page) =>
    page.rows.map((row) => ({ ...row, page: page.page })),
  );

  const frequency = new Map();
  for (const row of allRows) {
    const key = row.text.toLowerCase();
    frequency.set(key, (frequency.get(key) || 0) + 1);
  }
  // Anything that repeats across the book is a running header or footer.
  const repeatThreshold = Math.max(3, Math.ceil(pages.length * 0.08));

  const bodySize = median(allRows.map((row) => row.size)) || 10;
  const outline = [];
  const seen = new Set();

  for (const page of pages) {
    for (const row of page.rows) {
      if (frequency.get(row.text.toLowerCase()) >= repeatThreshold) continue;
      if (row.text.length > HEADING_MAX_LENGTH) continue;
      if (looksLikePageNumber(row.text)) continue;
      if (looksLikeNoise(row.text)) continue;

      const ratio = row.size / bodySize;
      let level = null;

      if (chapterPattern.test(row.text)) {
        level = 1;
      } else if (numberedPattern.test(row.text)) {
        const depth = row.text.match(numberedPattern)[1].split(".").length;
        level = Math.min(3, Math.max(1, depth));
      } else if (
        ratio >= 1.25 &&
        row.text.length <= 60 &&
        /^[A-Z0-9]/.test(row.text)
      ) {
        level = 2;
      }

      if (!level) continue;

      const title = cleanTitle(row.text);
      if (!title || title.length < 3) continue;

      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      outline.push({ title, level, page: page.page });
      if (outline.length >= MAX_OUTLINE_ENTRIES) return outline;
    }
  }

  // Books without a contents page often print "Chapter 1" and the title on
  // separate lines. Merge them into one heading.
  const merged = [];
  for (let index = 0; index < outline.length; index += 1) {
    const entry = outline[index];
    const next = outline[index + 1];
    if (
      next &&
      entry.level === 1 &&
      /^chapter\s+\d+$/i.test(entry.title) &&
      next.level <= 2 &&
      next.page === entry.page
    ) {
      merged.push({ ...entry, title: `${entry.title}: ${next.title}` });
      index += 1;
      continue;
    }
    merged.push(entry);
  }

  return merged;
};

/* ------------------------------------------------------------------ *
 * 3. File readers
 * ------------------------------------------------------------------ */

const extractPdf = async (buffer) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const rows = groupPdfRows(content.items);
    pages.push({
      page: number,
      rows,
      text: rows.map((row) => row.text).join("\n"),
    });
  }

  return { kind: "pdf", pageCount: document.numPages, pageAccurate: true, pages };
};

const extractDocx = async (buffer) => {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  const text = normalizeLines(value);
  const pages = [{ page: 1, rows: textRows(text), text }];
  return { kind: "docx", pageCount: null, pageAccurate: false, pages };
};

const normalizeLines = (value) =>
  String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

const textRows = (text) =>
  text.split(/\n+/).map((line) => ({
    text: normalize(line),
    size: /^(#{1,6}\s|\d+(\.\d+)*[.)]?\s|[A-Z][A-Z0-9 ,:&-]{3,}$)/.test(line) ? 16 : 10,
    y: 0,
  }));

const extractText = (buffer, filename) => {
  const text = normalizeLines(buffer.toString("utf8"));
  const chunks = text.includes("\f") ? text.split("\f") : [text];

  const pages = chunks.map((chunk, index) => ({
    page: index + 1,
    rows: textRows(chunk),
    text: normalizeLines(chunk),
  }));

  return {
    kind: filename.toLowerCase().endsWith(".md") ? "markdown" : "text",
    pageCount: chunks.length > 1 ? chunks.length : null,
    pageAccurate: chunks.length > 1,
    pages,
  };
};

/**
 * Main entry point. Returns the page text, a detected outline and a flag for
 * scanned PDFs that need OCR before any text analysis is possible.
 */
export async function extractDocument(buffer, filename = "document.pdf") {
  const lower = filename.toLowerCase();
  let result;

  if (lower.endsWith(".pdf")) {
    result = await extractPdf(buffer);
  } else if (lower.endsWith(".docx")) {
    result = await extractDocx(buffer);
  } else {
    result = extractText(buffer, filename);
  }

  const totalCharacters = result.pages.reduce(
    (sum, page) => sum + page.text.length,
    0,
  );
  const needsOcr =
    result.kind === "pdf" &&
    result.pageCount > 0 &&
    totalCharacters < result.pageCount * 40;

  const pageCount = result.pageCount || result.pages.length;
  const fromContents = needsOcr
    ? { outline: [], tocEntries: [] }
    : buildOutlineFromContents(result.pages, pageCount);

  const deterministic =
    fromContents.outline.length > 0
      ? fromContents.outline
      : needsOcr
        ? []
        : detectBodyOutline(result.pages);

  const outline = deterministic;

  return {
    kind: result.kind,
    pageCount: result.pageCount,
    pageAccurate: result.pageAccurate,
    needsOcr,
    characterCount: totalCharacters,
    tocEntries: fromContents.tocEntries,
    outline,
    pages: result.pages.map((page) => ({
      page: page.page,
      text: page.text,
    })),
  };
}

/**
 * A compact, human-readable topic map: "Page 14 — 1.1 Place value".
 */
export function formatOutline(outline, { limit = 120 } = {}) {
  return outline.slice(0, limit).map((entry) => ({
    ...entry,
    label: `${"  ".repeat(Math.max(0, entry.level - 1))}${entry.title}`,
  }));
}
