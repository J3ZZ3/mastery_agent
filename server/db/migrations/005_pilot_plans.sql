-- Pilot-to-paid conversion.
-- Every teacher starts on the free pilot. The pilot has a trial end date and
-- capacity limits; a paid plan removes the trial and raises the limits.
-- Existing classes stay usable after the trial ends, but creating classes and
-- adding students is paused until the account is upgraded.

alter table teachers
  add column if not exists plan text not null default 'pilot';

alter table teachers
  add column if not exists trial_ends_at timestamptz;

alter table teachers
  add column if not exists upgrade_requested_at timestamptz;

-- Give teachers created before this migration the same 60-day pilot window.
update teachers
set trial_ends_at = created_at + interval '60 days'
where trial_ends_at is null;

alter table teachers
  drop constraint if exists teachers_plan_check;

alter table teachers
  add constraint teachers_plan_check check (plan in ('pilot', 'paid'));

create index if not exists teachers_plan_idx on teachers (plan, trial_ends_at);
