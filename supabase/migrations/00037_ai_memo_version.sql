-- 00037_ai_memo_version.sql
-- Audit H1: regenerateAiMemoForValidation has a write race. Two near-
-- simultaneous edits (override + track-record edit, etc.) both fire it,
-- both read the validation, both call Claude, last-write-wins on
-- borrower_validations.ai_analysis. The slower-but-stale-input run can
-- overwrite the faster-but-current-input run.
--
-- Optimistic-lock fix: a version int that the regen read captures and
-- only writes if unchanged. Concurrent regens then write deterministically
-- — the second one sees its read was stale and aborts cleanly.

begin;

alter table public.borrower_validations
  add column if not exists ai_analysis_version integer not null default 0;

commit;
