-- Teacher account lifecycle.
-- Tokens are single-use and stored as SHA-256 hashes. Password resets and
-- email verification links expire; the raw token only exists in the email.

alter table teachers
  add column if not exists email_verified_at timestamptz;

create table if not exists teacher_tokens (
  id text primary key,
  teacher_id text not null references teachers(id) on delete cascade,
  purpose text not null check (purpose in ('password_reset', 'email_verification')),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists teacher_tokens_hash_uidx on teacher_tokens (token_hash);
create index if not exists teacher_tokens_teacher_idx on teacher_tokens (teacher_id, purpose);
create index if not exists teacher_tokens_expires_idx on teacher_tokens (expires_at);
