// Continuous monitoring runner — re-runs adapters for one validation,
// diffs against the previous-latest snapshot, persists fresh check
// rows + a monitor_runs entry, and emails on changes_found.
//
// One call per due subscription; the cron route picks up subscriptions
// whose next_run_at < now() and dispatches.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter } from "@/lib/adapters";
import { sendEmail } from "@/lib/email/resend";
import { materializeLitigationCases } from "@/lib/litigation/materialize";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export type ChangeSeverity = "info" | "warning" | "critical";

export interface MonitorChange {
  field: string;          // e.g. "entity.sos_status", "litigation.new_case"
  before: unknown;
  after: unknown;
  source: string;
  severity: ChangeSeverity;
}

export type AdapterStatus = "ok" | "rate_limited" | "failed" | "skipped";

export interface AdapterResult {
  status: AdapterStatus;
  error?: string;
}

export interface MonitorAdapterResults {
  entity: AdapterResult;
  litigation: AdapterResult;
  sanctions: AdapterResult;
}

// Pragmatic rate-limit detection — vendor adapters don't yet throw typed
// errors. String-match on the error message; typed errors are P1.
function classifyError(err: unknown): AdapterResult {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return { status: "rate_limited", error: msg };
  }
  return { status: "failed", error: msg };
}

export function anyRateLimited(results: MonitorAdapterResults): boolean {
  return (
    results.entity.status === "rate_limited" ||
    results.litigation.status === "rate_limited" ||
    results.sanctions.status === "rate_limited"
  );
}

interface SubscriptionRow {
  id: string;
  validation_id: string;
  org_id: string;
  cadence: "daily" | "weekly" | "monthly";
  notify_emails: string[];
  enabled: boolean;
}

const CADENCE_MS: Record<SubscriptionRow["cadence"], number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export interface RunResult {
  status: "clean" | "changes_found" | "error";
  changes: MonitorChange[];
  error?: string;
  cost_cents: number;
  adapter_results: MonitorAdapterResults;
}

export async function runSubscription(
  supabase: SupabaseClient,
  sub: SubscriptionRow,
): Promise<RunResult> {
  const adapter_results: MonitorAdapterResults = {
    entity: { status: "skipped" },
    litigation: { status: "skipped" },
    sanctions: { status: "skipped" },
  };

  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, borrower_name, borrower_entity_name")
    .eq("id", sub.validation_id)
    .single();

  if (!validation) {
    return { status: "error", changes: [], error: "Validation not found", cost_cents: 0, adapter_results };
  }

  // Latest known state
  const [latestEntity, latestSanctions, knownLitigation] = await Promise.all([
    supabase
      .from("entity_checks")
      .select("entity_name, state, sos_status, registered_agent, flags")
      .eq("validation_id", sub.validation_id)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sanctions_checks")
      .select("result, match_count, matches")
      .eq("validation_id", sub.validation_id)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("litigation_checks")
      .select("case_number, raw_response")
      .eq("validation_id", sub.validation_id),
  ]);

  if (!latestEntity.data) {
    return {
      status: "error",
      changes: [],
      error: "No prior entity_check to compare against",
      cost_cents: 0,
      adapter_results,
    };
  }

  const adapter = getAdapter();
  const changes: MonitorChange[] = [];
  let cost_cents = 0;

  // ── Entity SOS ─────────────────────────────────────────────────────────
  try {
    const entityResult = await adapter.lookupEntity({
      entity_name: latestEntity.data.entity_name,
      state: latestEntity.data.state,
    });

    if (entityResult.sos_status !== latestEntity.data.sos_status) {
      changes.push({
        field: "entity.sos_status",
        before: latestEntity.data.sos_status,
        after: entityResult.sos_status,
        source: "Cobalt Intelligence",
        severity:
          entityResult.sos_status === "dissolved" || entityResult.sos_status === "suspended"
            ? "critical"
            : "warning",
      });
    }
    if (
      entityResult.registered_agent &&
      latestEntity.data.registered_agent &&
      entityResult.registered_agent !== latestEntity.data.registered_agent
    ) {
      changes.push({
        field: "entity.registered_agent",
        before: latestEntity.data.registered_agent,
        after: entityResult.registered_agent,
        source: "Cobalt Intelligence",
        severity: "info",
      });
    }
    const beforeFlags = (latestEntity.data.flags as string[]) ?? [];
    const newFlags = entityResult.flags.filter((f) => !beforeFlags.includes(f));
    for (const flag of newFlags) {
      changes.push({
        field: "entity.flags",
        before: null,
        after: flag,
        source: "Cobalt Intelligence",
        severity: "warning",
      });
    }

    await insertOrThrow(
      supabase.from("entity_checks").insert({
        validation_id: sub.validation_id,
        org_id: sub.org_id,
        entity_id: null,  // not joined here; the canonical entity row has its own cache
        entity_name: entityResult.entity_name,
        state: entityResult.state,
        entity_type: entityResult.entity_type,
        sos_status: entityResult.sos_status,
        formation_date: entityResult.formation_date,
        last_filing_date: entityResult.last_filing_date,
        registered_agent: entityResult.registered_agent,
        source_url: entityResult.source_url,
        confidence: entityResult.sos_status === "not_found" ? "low" : "medium",
        flags: entityResult.flags,
        raw_response: entityResult.raw_response,
      }),
      `monitor entity_checks insert (validation_id=${sub.validation_id})`,
    );
    if (process.env.COBALT_INTELLIGENCE_API_KEY) cost_cents += 500;
    adapter_results.entity = { status: "ok" };
  } catch (err) {
    adapter_results.entity = classifyError(err);
    console.error("Monitor entity check failed:", err);
  }

  // ── Litigation ─────────────────────────────────────────────────────────
  try {
    const litigationResults = await adapter.searchLitigation({
      entity_name: latestEntity.data.entity_name,
      borrower_name: validation.borrower_name,
    });
    const knownCaseNumbers = new Set(
      ((knownLitigation.data ?? []) as Array<{ case_number: string | null }>)
        .map((l) => l.case_number)
        .filter(Boolean),
    );
    const newCases = litigationResults.filter(
      (l) => l.result === "found" && l.case_number && !knownCaseNumbers.has(l.case_number),
    );
    for (const c of newCases) {
      changes.push({
        field: "litigation.new_case",
        before: null,
        after: { case_number: c.case_number, search_type: c.search_type, details: c.details },
        source: c.source,
        severity: "critical",
      });
    }

    if (litigationResults.length > 0) {
      await insertOrThrow(
        supabase.from("litigation_checks").insert(
          litigationResults.map((l) => ({
            validation_id: sub.validation_id,
            org_id: sub.org_id,
            search_type: l.search_type,
            entity_name: l.entity_name,
            result: l.result,
            details: l.details,
            case_number: l.case_number,
            source: l.source,
            confidence: "medium",
            raw_response: l.raw_response,
          })),
        ),
        `monitor litigation_checks insert (validation_id=${sub.validation_id}, count=${litigationResults.length})`,
      );
    }
    if (process.env.COURTLISTENER_API_TOKEN) cost_cents += 1000;
    adapter_results.litigation = { status: "ok" };

    // Re-materialize litigation_cases for the case-card UI now that fresh
    // litigation_checks rows landed. Idempotent — same (validation_id,
    // case_number) updates in place; truly new cases get inserted.
    if (litigationResults.length > 0) {
      try {
        await materializeLitigationCases(supabase, sub.validation_id, sub.org_id);
      } catch (err) {
        console.warn("Monitor litigation_cases materialize failed:", err);
      }
    }
  } catch (err) {
    adapter_results.litigation = classifyError(err);
    console.error("Monitor litigation check failed:", err);
  }

  // ── Sanctions ──────────────────────────────────────────────────────────
  try {
    const sanctions = await adapter.screenSanctions({
      borrower_name: validation.borrower_name,
      entity_name: validation.borrower_entity_name ?? undefined,
    });

    const beforeMatches = (latestSanctions.data?.matches as Array<{ matched_name?: string; list_name?: string }> | undefined) ?? [];
    const beforeKey = (m: { matched_name?: string; list_name?: string }) => `${m.matched_name ?? ""}::${m.list_name ?? ""}`;
    const beforeSet = new Set(beforeMatches.map(beforeKey));
    const newMatches = sanctions.matches.filter((m) => !beforeSet.has(beforeKey(m)));
    for (const m of newMatches) {
      changes.push({
        field: "sanctions.new_match",
        before: null,
        after: { matched_name: m.matched_name, list_name: m.list_name, score: m.score },
        source: sanctions.source,
        severity: "critical",
      });
    }

    if (sanctions.result !== latestSanctions.data?.result) {
      changes.push({
        field: "sanctions.result",
        before: latestSanctions.data?.result ?? null,
        after: sanctions.result,
        source: sanctions.source,
        severity: sanctions.result === "potential_match" ? "critical" : "info",
      });
    }

    await insertOrThrow(
      supabase.from("sanctions_checks").insert({
        validation_id: sub.validation_id,
        borrower_name: validation.borrower_name,
        entity_name: validation.borrower_entity_name,
        result: sanctions.result,
        match_count: sanctions.matches.length,
        matches: sanctions.matches,
        sources_searched: sanctions.sources_searched,
        source: sanctions.source,
        raw_response: sanctions.raw_response,
      }),
      `monitor sanctions_checks insert (validation_id=${sub.validation_id})`,
    );
    if (sanctions.source.includes("opensanctions")) cost_cents += 100;
    adapter_results.sanctions = { status: "ok" };
  } catch (err) {
    adapter_results.sanctions = classifyError(err);
    console.error("Monitor sanctions check failed:", err);
  }

  return {
    status: changes.length > 0 ? "changes_found" : "clean",
    changes,
    cost_cents,
    adapter_results,
  };
}

export function nextRunAt(cadence: SubscriptionRow["cadence"]): Date {
  return new Date(Date.now() + CADENCE_MS[cadence]);
}

// Rate-limit backoff — when any adapter returns 429, we don't want to advance
// the full cadence (would skip a real check window) but also don't want to
// retry immediately (would hammer the vendor). Compromise: 1h.
export function rateLimitedRunAt(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

export function buildEmailHtml(opts: {
  borrower: string;
  entity: string | null;
  changes: MonitorChange[];
  validationUrl: string;
}): string {
  const rows = opts.changes
    .map((c) => {
      const color =
        c.severity === "critical" ? "#b91c1c" : c.severity === "warning" ? "#b45309" : "#475569";
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:${color};font-weight:600;">${c.field}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${c.before == null ? "—" : escapeHtml(JSON.stringify(c.before))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${c.after == null ? "—" : escapeHtml(JSON.stringify(c.after))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${c.source}</td>
      </tr>`;
    })
    .join("");

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0f172a;">
    <div style="border-bottom:3px solid #0f172a;padding-bottom:12px;margin-bottom:16px;">
      <p style="color:#3b82f6;font-weight:700;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;margin:0;">PulseClose Monitoring Alert</p>
      <h1 style="margin:6px 0 0;font-size:18px;">${escapeHtml(opts.borrower)}${opts.entity ? ` — ${escapeHtml(opts.entity)}` : ""}</h1>
    </div>
    <p>Continuous monitoring detected ${opts.changes.length} change${opts.changes.length === 1 ? "" : "s"} on this borrower since the last check.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 10px;background:#0f172a;color:#fff;">Field</th>
          <th style="text-align:left;padding:6px 10px;background:#0f172a;color:#fff;">Before</th>
          <th style="text-align:left;padding:6px 10px;background:#0f172a;color:#fff;">After</th>
          <th style="text-align:left;padding:6px 10px;background:#0f172a;color:#fff;">Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;"><a href="${opts.validationUrl}" style="color:#3b82f6;">Open validation detail →</a></p>
    <p style="margin-top:24px;font-size:11px;color:#94a3b8;">You're receiving this because the validation is enrolled in continuous monitoring. Disable on the validation detail page.</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyChanges(
  sub: SubscriptionRow,
  borrower: { borrower_name: string; borrower_entity_name: string | null },
  changes: MonitorChange[],
  publicBaseUrl: string,
): Promise<boolean> {
  if (sub.notify_emails.length === 0) return false;
  const validationUrl = `${publicBaseUrl}/dashboard/validations/${sub.validation_id}`;
  const subject = `PulseClose: ${changes.length} change${changes.length === 1 ? "" : "s"} on ${borrower.borrower_name}`;
  const html = buildEmailHtml({
    borrower: borrower.borrower_name,
    entity: borrower.borrower_entity_name,
    changes,
    validationUrl,
  });
  return sendEmail({ to: sub.notify_emails, subject, html });
}
