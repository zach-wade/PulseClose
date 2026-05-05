# Archive

Historical pre-shipment plans for features that have since shipped.
Kept for reference (decision rationale, original scope) but **not
maintained** and **not authoritative** for current behavior.

For current state, see:

- [../../STRATEGY.md](../../STRATEGY.md) — product strategy
- [../ROADMAP.md](../ROADMAP.md) — journey-organized backlog
- [../../pickup.md](../../pickup.md) — current session state
- [../../src/lib/monitor/runner.ts](../../src/lib/monitor/runner.ts) — actual monitoring runtime
- [../../src/lib/track-record/verify-core.ts](../../src/lib/track-record/verify-core.ts) — actual verify-core implementation
- [../../supabase/migrations/00014_monitoring.sql](../../supabase/migrations/00014_monitoring.sql) + [00025_borrower_monitor.sql](../../supabase/migrations/00025_borrower_monitor.sql) — monitoring schema
- [../../supabase/migrations/00021_canonical_name_dedup.sql](../../supabase/migrations/00021_canonical_name_dedup.sql) — canonical-name dedup that supersedes the original verify plan's name matching

## Why these were archived

- **CONTINUOUS_MONITORING_PLAN.md** — pre-shipment design for what became migration 00014 + the runner. The shipped product evolved past the plan: critical-only severity filter (B1, 00025), borrower-level subscription templates (B1), per-adapter status tracking in `monitor_runs.adapter_results`, 1h backoff on rate limits.
- **TRACK_RECORD_VERIFY_PLAN.md** — pre-shipment design for what became `verify-core.ts`. The shipped product evolved past the plan: tokenize-and-set name matcher (replaces the original substring approach), canonical-name dedup with dual-coded SQL/JS keys, address parser fix for `, City, ST ZIP` envelope. Roadmap principles 8-10 codify the lessons learned.
