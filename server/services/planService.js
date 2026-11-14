import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../db/postgres.js";
import { AppError } from "../lib/errors.js";
import { extractDocument } from "./documentExtraction.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, "..", "..");
const UPLOAD_ROOT = path.resolve(here, "..", "uploads");

/**
 * The two documents a teacher can upload. Each slot maps to fixed column names
 * so no user input ever reaches the SQL text.
 */
const RESOURCE_SLOTS = {
  "student-book": {
    label: "student book",
    pathColumn: "student_book_path",
    nameColumn: "student_book_name",
    uploadedColumn: "student_book_uploaded_at",
    kindColumn: "student_book_kind",
    pageCountColumn: "student_book_page_count",
    outlineColumn: "student_book_outline",
    extractColumn: "student_book_extract_path",
    needsOcrColumn: "student_book_needs_ocr",
  },
  "teachers-guide": {
    label: "teacher's guide",
    pathColumn: "teachers_guide_path",
    nameColumn: "teachers_guide_name",
    uploadedColumn: "teachers_guide_uploaded_at",
    kindColumn: "teachers_guide_kind",
    pageCountColumn: "teachers_guide_page_count",
    outlineColumn: "teachers_guide_outline",
    extractColumn: "teachers_guide_extract_path",
    needsOcrColumn: "teachers_guide_needs_ocr",
  },
};

const resourceDto = (row, slot) => {
  const storedPath = row[slot.pathColumn];
  if (!storedPath) return null;
  return {
    path: storedPath,
    name: row[slot.nameColumn] || path.basename(storedPath),
    uploadedAt: row[slot.uploadedColumn] || null,
    kind: row[slot.kindColumn] || null,
    pageCount: row[slot.pageCountColumn] ?? null,
    outline: Array.isArray(row[slot.outlineColumn]) ? row[slot.outlineColumn] : [],
    needsOcr: Boolean(row[slot.needsOcrColumn]),
    hasExtract: Boolean(row[slot.extractColumn]),
  };
};

const RESOURCE_SELECT = `
  select
    id,
    student_book_path,
    student_book_name,
    student_book_uploaded_at,
    student_book_kind,
    student_book_page_count,
    student_book_outline,
    student_book_extract_path,
    student_book_needs_ocr,
    teachers_guide_path,
    teachers_guide_name,
    teachers_guide_uploaded_at,
    teachers_guide_kind,
    teachers_guide_page_count,
    teachers_guide_outline,
    teachers_guide_extract_path,
    teachers_guide_needs_ocr
  from teachers
  where id = $1
`;

/**
 * The two uploaded documents for one teacher, or null for each slot that has
 * not been uploaded yet.
 */
export async function getTeacherResources(teacherId) {
  const { rows } = await query(RESOURCE_SELECT, [teacherId]);
  const row = rows[0];
  if (!row) throw new AppError(404, "Teacher account not found.");

  return {
    studentBook: resourceDto(row, RESOURCE_SLOTS["student-book"]),
    teachersGuide: resourceDto(row, RESOURCE_SLOTS["teachers-guide"]),
  };
}

/**
 * Resource status plus current usage for one teacher. There are no plan limits
 * or trial state: the teacher always has full access to their own classes.
 */
export async function getTeacherPlan(teacherId) {
  const resources = await getTeacherResources(teacherId);

  const { rows } = await query(
    `select
       (select count(*)::int from classes c
         where c.teacher_id = $1 and c.archived_at is null) as class_count,
       (select count(*)::int from students s
         join classes c on c.id = s.class_id
         where c.teacher_id = $1 and c.archived_at is null) as student_count`,
    [teacherId],
  );

  const usage = {
    classes: Number(rows[0]?.class_count || 0),
    students: Number(rows[0]?.student_count || 0),
  };

  return {
    plan: "resources",
    studentBook: resources.studentBook,
    teachersGuide: resources.teachersGuide,
    // Legacy flat fields kept so older screens keep working.
    studentBookPath: resources.studentBook?.path || null,
    teachersGuidePath: resources.teachersGuide?.path || null,
    usage,
  };
}

const safeFilename = (value) => {
  const base = String(value || "resource")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  const cleaned = base.replace(/[^\w.\-]+/g, "_").slice(-120);
  return cleaned || "resource";
};

const relativeToRoot = (absolutePath) =>
  path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join("/");

/**
 * Persist an uploaded document to disk, extract its text page by page, and
 * record the detected topic outline on the teacher row. A JSON sidecar keeps
 * the full page text so it can be read later without re-parsing the PDF.
 */
export async function saveTeacherResource(teacherId, slotKey, { filename, buffer }) {
  const slot = RESOURCE_SLOTS[slotKey];
  if (!slot) throw new AppError(400, "Unknown resource slot.");
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, "The uploaded file is empty.");
  }

  const safe = safeFilename(filename);
  const teacherDir = path.join(UPLOAD_ROOT, teacherId);
  await fs.mkdir(teacherDir, { recursive: true });

  const storedName = `${Date.now()}-${safe}`;
  const absolutePath = path.join(teacherDir, storedName);
  await fs.writeFile(absolutePath, buffer);

  const relativePath = relativeToRoot(absolutePath);

  let extraction = null;
  try {
    extraction = await extractDocument(buffer, safe);
  } catch (error) {
    console.error("[MASTERY] Could not extract the uploaded document:", error.message);
  }

  let extractPath = null;
  if (extraction) {
    const sidecarPath = `${absolutePath}.extract.json`;
    await fs.writeFile(sidecarPath, JSON.stringify(extraction));
    extractPath = relativeToRoot(sidecarPath);
  }

  const { rows } = await query(
    `update teachers
        set ${slot.pathColumn} = $2,
            ${slot.nameColumn} = $3,
            ${slot.uploadedColumn} = now(),
            ${slot.kindColumn} = $4,
            ${slot.pageCountColumn} = $5,
            ${slot.outlineColumn} = $6,
            ${slot.extractColumn} = $7,
            ${slot.needsOcrColumn} = $8
      where id = $1
      returning id`,
    [
      teacherId,
      relativePath,
      safe,
      extraction?.kind || null,
      extraction?.pageCount ?? null,
      extraction ? JSON.stringify(extraction.outline || []) : null,
      extractPath,
      extraction?.needsOcr ?? false,
    ],
  );
  if (!rows[0]) throw new AppError(404, "Teacher account not found.");

  return getTeacherResources(teacherId);
}

const readExtract = async (teacherId, slotKey) => {
  const slot = RESOURCE_SLOTS[slotKey];
  if (!slot) throw new AppError(400, "Unknown resource slot.");

  const { rows } = await query(
    `select ${slot.extractColumn} as extract_path, ${slot.nameColumn} as name
       from teachers where id = $1`,
    [teacherId],
  );
  const row = rows[0];
  if (!row) throw new AppError(404, "Teacher account not found.");
  if (!row.extract_path) {
    throw new AppError(404, "This document has not been extracted yet.");
  }

  const absolutePath = path.resolve(PROJECT_ROOT, row.extract_path);
  const text = await fs.readFile(absolutePath, "utf8");
  return { name: row.name, extract: JSON.parse(text) };
};

/** The detected topic/subtopic outline with PDF page numbers. */
export async function getResourceOutline(teacherId, slotKey) {
  const { name, extract } = await readExtract(teacherId, slotKey);
  return {
    name,
    kind: extract.kind,
    pageCount: extract.pageCount,
    pageAccurate: extract.pageAccurate,
    needsOcr: extract.needsOcr,
    outline: extract.outline || [],
    tocEntries: extract.tocEntries || [],
  };
}

/**
 * The full parsed document (page text included) for the agent pipeline.
 * Kept separate from the HTTP endpoints so agents can read page ranges
 * without re-parsing the PDF.
 */
export async function getResourceDocument(teacherId, slotKey) {
  const { name, extract } = await readExtract(teacherId, slotKey);
  return {
    name,
    kind: extract.kind,
    pageCount: extract.pageCount,
    pageAccurate: extract.pageAccurate,
    needsOcr: Boolean(extract.needsOcr),
    pages: extract.pages || [],
    outline: extract.outline || [],
    tocEntries: extract.tocEntries || [],
  };
}

/**
 * Persist an agent-verified outline so the Resources page and the syllabus
 * discussion use the corrected topic-to-page map from then on.
 */
export async function saveResourceOutline(teacherId, slotKey, outline) {
  const slot = RESOURCE_SLOTS[slotKey];
  if (!slot) throw new AppError(400, "Unknown resource slot.");

  const { rows } = await query(
    `update teachers
        set ${slot.outlineColumn} = $2
      where id = $1
      returning id`,
    [teacherId, JSON.stringify(outline || [])],
  );
  if (!rows[0]) throw new AppError(404, "Teacher account not found.");
}

/** Page text for a range of pages, used as grounded context for the AI. */
export async function getResourcePages(teacherId, slotKey, { from = 1, to = null } = {}) {
  const { name, extract } = await readExtract(teacherId, slotKey);
  const start = Math.max(1, Number(from) || 1);
  const end = Math.min(
    Number(to) || extract.pages.length,
    extract.pages.length,
  );

  return {
    name,
    pageCount: extract.pageCount,
    from: start,
    to: end,
    pages: extract.pages
      .filter((page) => page.page >= start && page.page <= end)
      .map((page) => ({ page: page.page, text: page.text })),
  };
}

/* AI syllabus discussion removed by request. */
