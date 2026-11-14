-- Teacher resource uploads.
-- Teachers upload a learner book and a teacher's guide. The server stores the
-- file on disk and records its path and original filename here so the AI
-- syllabus discussion can refer to the documents the teacher provided.
-- No billing, trial or capacity limits are part of the product.

alter table teachers
  add column if not exists student_book_path text;

alter table teachers
  add column if not exists student_book_name text;

alter table teachers
  add column if not exists student_book_uploaded_at timestamptz;

alter table teachers
  add column if not exists teachers_guide_path text;

alter table teachers
  add column if not exists teachers_guide_name text;

alter table teachers
  add column if not exists teachers_guide_uploaded_at timestamptz;
