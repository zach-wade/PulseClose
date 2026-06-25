-- 00048 — Litigation screen "not_run" state (calibration finding #13).
--
-- A failed litigation search (CourtListener 429 / upstream error) was previously
-- indistinguishable from a clean "0 records found" result: the adapter swallowed
-- the error and returned an empty set, the pipeline read that as "clear", AWARDED
-- +10 confidence, and kept overall_status = "verified". A check that never ran
-- read as — and scored as — a passed check (a direct trust violation: "can't
-- trust the output without the inputs").
--
-- Sanctions already models this honestly (SanctionsScreenResult.result =
-- 'not_run'). This migration extends the litigation_checks.result CHECK so the
-- litigation pillar can persist the same distinct state. A 'not_run' row is the
-- incompleteness sentinel — never counted as a hit, never materialized as a case
-- (extract.ts ignores result !== 'found'), and it suppresses the "no litigation"
-- confidence bonus + forces overall_status to at least "partial".

alter table public.litigation_checks
  drop constraint if exists litigation_checks_result_check;

alter table public.litigation_checks
  add constraint litigation_checks_result_check
    check (result in ('clear', 'found', 'pending', 'not_run'));
