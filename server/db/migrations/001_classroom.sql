-- Classroom tenancy: one teacher owns many classes; each class owns a roster.
-- Learning sessions will be linked to classes and students in the next migration.

create table if not exists teachers (
  id text primary key,
  email text not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists teachers_email_lower_uidx on teachers (lower(email));

create table if not exists classes (
  id text primary key,
  teacher_id text not null references teachers(id) on delete cascade,
  name text not null,
  subject text not null default 'Mathematics',
  grade integer,
  join_code text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists classes_join_code_uidx on classes (join_code);
create index if not exists classes_teacher_idx on classes (teacher_id);

create table if not exists students (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  display_name text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create unique index if not exists students_class_name_uidx on students (class_id, lower(display_name));
create index if not exists students_class_idx on students (class_id);

create table if not exists auth_sessions (
  id text primary key,
  token_hash text not null,
  role text not null check (role in ('teacher', 'student')),
  teacher_id text references teachers(id) on delete cascade,
  student_id text references students(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint auth_sessions_principal check (
    (role = 'teacher' and teacher_id is not null and student_id is null) or
    (role = 'student' and teacher_id is null and student_id is not null)
  )
);

create unique index if not exists auth_sessions_token_uidx on auth_sessions (token_hash);
create index if not exists auth_sessions_expires_idx on auth_sessions (expires_at);
