-- Pilot consent and classroom controls.
-- `consent_attested_at` records that the teacher confirmed they have the
-- school/guardian permission required to create accounts for minors.

alter table classes
  add column if not exists consent_attested_at timestamptz;
