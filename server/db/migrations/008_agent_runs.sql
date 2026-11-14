-- Observable agent runs for teacher document analysis.
-- Every thought, tool call, observation and handoff is stored as JSON so the
-- teacher can watch the agents reason, and so a run can be audited afterwards.

create table if not exists agent_runs (
  id text primary key,
  teacher_id text not null references teachers(id) on delete cascade,
  slot text not null,
  status text not null default 'running',
  goal text,
  provider text,
  provider_label text,
  trace jsonb not null default '[]'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_teacher_idx
  on agent_runs (teacher_id, created_at desc);
