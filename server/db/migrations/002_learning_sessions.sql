-- Learning sessions are owned by a student and scoped to that student's class.
-- The full orchestrator snapshot is stored as JSONB so the agent workflow can
-- evolve without a migration per field; indexed columns support cheap queries.

create table if not exists learning_sessions (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  status text not null,
  attempt integer not null default 0,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz,
  completed_at timestamptz
);

create index if not exists learning_sessions_student_idx
  on learning_sessions (student_id, created_at desc);

create index if not exists learning_sessions_class_idx
  on learning_sessions (class_id, created_at desc);

create index if not exists learning_sessions_active_idx
  on learning_sessions (student_id, updated_at desc)
  where status in ('diagnostic', 'analyzing', 'learning', 'mastery', 'retry', 'error');
