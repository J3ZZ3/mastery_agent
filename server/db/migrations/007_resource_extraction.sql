-- Structured extraction for uploaded teacher resources.
-- The original file is kept on disk; a JSON sidecar holds the per-page text.
-- These columns hold the quick-access metadata and the detected outline
-- (topic/subtopic -> PDF page) so the AI can answer "which pages for which
-- topic" without re-parsing the book on every request.

alter table teachers
  add column if not exists student_book_kind text,
  add column if not exists student_book_page_count int,
  add column if not exists student_book_outline jsonb,
  add column if not exists student_book_extract_path text,
  add column if not exists student_book_needs_ocr boolean not null default false;

alter table teachers
  add column if not exists teachers_guide_kind text,
  add column if not exists teachers_guide_page_count int,
  add column if not exists teachers_guide_outline jsonb,
  add column if not exists teachers_guide_extract_path text,
  add column if not exists teachers_guide_needs_ocr boolean not null default false;
