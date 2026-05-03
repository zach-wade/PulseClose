-- 00022_ai_privacy.sql
-- Per-org toggle that gates all Claude API calls (doc ingestion, address
-- extraction, AI risk memo). Default true so existing tenants don't change
-- behavior; orgs opt OUT, not in. The actual PII redaction (regex scrub
-- on doc text + tokenized memo prompt) lives in src/lib/ai/redact*.ts and
-- is always-on — this column is the strict-mode kill switch for tenants
-- who refuse any LLM exposure of borrower data.

begin;

alter table public.organizations
  add column if not exists ai_extraction_enabled boolean not null default true;

commit;
