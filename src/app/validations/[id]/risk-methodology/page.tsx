// Server-rendered printable risk methodology page. Counter to the
// "this is just AI" objection — investors and credit committees see the
// rule engine math directly, factor by factor, with the signal-override
// audit trail. Pairs with the handoff PDF.
//
// Auth: RLS-gated via the user's org. Lives outside /dashboard so the
// printable surface is sidebar-free.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import {
  deriveTier,
  humanizeFactorKey,
  type RiskFactor,
  type Tier,
} from "@/lib/risk/factors";

export const dynamic = "force-dynamic";

// Canonical render order — matches factors.ts compute order so the printable
// is the same shape across borrowers.
const FACTOR_ORDER = [
  "entity_status",
  "active_fed_litigation",
  "dismissed_litigation",
  "sanctions_hit",
  "gc_license_issue",
  "extended_hold",
  "lender_concentration",
  "address_consistency",
  "foreclosure_distress",
  "market_outlier",
  "market_outlier_unavailable",
];

interface SignalRow {
  signal_key: string;
  signal_value: unknown;
  reason: string | null;
  source: string | null;
  set_by_user_id: string | null;
  created_at: string;
  superseded_at: string | null;
  // For property-scoped signals we want to surface which property
  property_id?: string | null;
}

interface PropertyMini {
  id: string;
  address_display: string;
}

function severityColor(severity: string, excluded: boolean): string {
  if (excluded) return "#94a3b8";
  if (severity === "critical") return "#b91c1c";
  if (severity === "moderate") return "#b45309";
  if (severity === "minor") return "#0369a1";
  if (severity === "informational") return "#64748b";
  return "#16a34a";
}

function severityLabel(severity: string): string {
  if (severity === "none") return "Cleared";
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s.slice(0, 10);
  }
}

function renderContributingData(
  factorKey: string,
  data: Record<string, unknown> | null,
): string | null {
  if (!data || Object.keys(data).length === 0) return null;
  const parts: string[] = [];

  // Render shapes we know — keep generic catch-all at the end.
  const props = data.properties as
    | Array<{ property_address?: string; property_id?: string; ratio?: number; direction?: string }>
    | undefined;
  if (Array.isArray(props) && props.length > 0) {
    parts.push(
      `Properties: ${props
        .slice(0, 8)
        .map((p) => p.property_address ?? p.property_id ?? "—")
        .join("; ")}${props.length > 8 ? ` … (+${props.length - 8} more)` : ""}`,
    );
  }

  const cases = data.cases as
    | Array<{ case_number?: string; details?: string }>
    | undefined;
  if (Array.isArray(cases) && cases.length > 0) {
    parts.push(
      `Cases: ${cases
        .slice(0, 5)
        .map((c) => c.case_number ?? c.details ?? "—")
        .join("; ")}`,
    );
  }

  const matches = data.matches as
    | Array<{ matched_name?: string; list_name?: string; score?: number }>
    | undefined;
  if (Array.isArray(matches) && matches.length > 0) {
    parts.push(
      `Matches: ${matches
        .map((m) => `${m.matched_name ?? "?"} (${m.list_name ?? "?"})`)
        .join("; ")}`,
    );
  }

  if (typeof data.lender_name === "string") parts.push(`Lender: ${data.lender_name}`);
  if (typeof data.threshold_months === "number")
    parts.push(`Threshold: ${data.threshold_months} months`);

  // Hide structural/internal keys from the catch-all
  const skipKeys = new Set([
    "schema_version",
    "properties",
    "cases",
    "matches",
    "lender_name",
    "threshold_months",
    "thresholds",
  ]);
  for (const [k, v] of Object.entries(data)) {
    if (skipKeys.has(k)) continue;
    if (v == null || typeof v === "object") continue;
    parts.push(`${k}: ${String(v)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : `${factorKey}: (no structured data)`;
}

interface ValidationRow {
  id: string;
  borrower_name: string;
  borrower_entity_name: string | null;
  guarantor_name: string | null;
  validation_date: string | null;
  created_at: string;
  primary_borrower_id: string | null;
  primary_entity_id: string | null;
}

async function loadData(id: string, orgId: string) {
  const supabase = createAdminClient();

  const validationRes = await supabase
    .from("borrower_validations")
    .select(
      "id, borrower_name, borrower_entity_name, guarantor_name, validation_date, created_at, primary_borrower_id, primary_entity_id",
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (validationRes.error || !validationRes.data) return null;

  const validation = validationRes.data as ValidationRow;

  const factorsRes = await supabase
    .from("risk_factors")
    .select("*")
    .eq("validation_id", id)
    .order("computed_at", { ascending: false });
  const factors = (factorsRes.data ?? []) as RiskFactor[];

  // Pull signals across all four scopes for the audit trail. Each scope
  // gets its own table so we issue four reads in parallel. Plus the
  // data_edits + factor_overrides for the new lender-edit trail.
  const [borrowerSig, propertySig, bpSig, entitySig, propertiesRes, editsRes, overridesRes] = await Promise.all([
    validation.primary_borrower_id
      ? supabase
          .from("borrower_signals")
          .select("signal_key, signal_value, reason, source, set_by_user_id, created_at, superseded_at")
          .eq("borrower_id", validation.primary_borrower_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    Promise.resolve({ data: [] as SignalRow[] }), // property-only signals — leave for future
    validation.primary_borrower_id
      ? supabase
          .from("borrower_property_signals")
          .select("signal_key, signal_value, reason, source, set_by_user_id, created_at, superseded_at, property_id")
          .eq("borrower_id", validation.primary_borrower_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    validation.primary_entity_id
      ? supabase
          .from("entity_signals")
          .select("signal_key, signal_value, reason, source, set_by_user_id, created_at, superseded_at")
          .eq("entity_id", validation.primary_entity_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // Properties for address lookup on borrower_property_signals rows
    supabase
      .from("track_record_entries")
      .select("property_id, properties:property_id ( id, address_display )")
      .eq("validation_id", id),
    // Lender data edits for this validation
    supabase
      .from("data_edits")
      .select("table_name, field_name, edit_kind, reason, edited_at, value_before, value_after")
      .eq("validation_id", id)
      .order("edited_at", { ascending: false }),
    // Manual factor overrides
    supabase
      .from("factor_overrides")
      .select("factor_key, exclusion_reason, updated_at")
      .eq("validation_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  const propertyMap = new Map<string, string>();
  for (const t of (propertiesRes.data ?? []) as Array<{
    property_id: string | null;
    properties:
      | { id: string; address_display: string }
      | { id: string; address_display: string }[]
      | null;
  }>) {
    if (!t.property_id) continue;
    const p = Array.isArray(t.properties) ? t.properties[0] : t.properties;
    if (p?.address_display) propertyMap.set(p.id, p.address_display);
  }

  const allSignals: Array<SignalRow & { scope: string }> = [
    ...((borrowerSig.data as SignalRow[] | undefined) ?? []).map((s) => ({ ...s, scope: "borrower" })),
    ...((bpSig.data as SignalRow[] | undefined) ?? []).map((s) => ({
      ...s,
      scope: "borrower×property",
    })),
    ...((entitySig.data as SignalRow[] | undefined) ?? []).map((s) => ({ ...s, scope: "entity" })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  type EditRow = {
    table_name: string;
    field_name: string;
    edit_kind: "update" | "add" | "delete";
    reason: string | null;
    edited_at: string;
    value_before: unknown;
    value_after: unknown;
  };
  type OverrideRow = { factor_key: string; exclusion_reason: string; updated_at: string };

  return {
    validation,
    factors,
    signals: allSignals,
    propertyMap,
    edits: ((editsRes?.data as EditRow[] | undefined) ?? []),
    overrides: ((overridesRes?.data as OverrideRow[] | undefined) ?? []),
  };
}

export default async function RiskMethodologyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const autoprint = sp.print === "1";
  const profile = await getUserProfile();
  if (!profile) notFound();

  const data = await loadData(id, profile.org_id);
  if (!data) notFound();

  const { validation, factors, signals, propertyMap, edits, overrides } = data;
  const tier = deriveTier(factors);

  // Reorder factors for canonical printable layout
  const ordered = [...factors].sort((a, b) => {
    const ai = FACTOR_ORDER.indexOf(a.factor_key);
    const bi = FACTOR_ORDER.indexOf(b.factor_key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <html>
      <head>
        <title>Risk Methodology — {validation.borrower_name}</title>
        <style>{styles}</style>
      </head>
      <body>
        <div className="rm-toolbar">
          <button
            type="button"
            className="rm-btn"
            // Server-rendered HTML — inline handler so we don't pull in
            // a client component just for the print button.
            {...({ onclick: "window.print()" } as Record<string, string>)}
          >
            Print / Save as PDF
          </button>
        </div>
        {autoprint && (
          // Auto-fire print dialog on load when invoked with ?print=1.
          // Small delay lets layout settle before the dialog renders.
          <script
            dangerouslySetInnerHTML={{
              __html: "window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });",
            }}
          />
        )}
        <header className="rm-header">
          <div>
            <p className="rm-org">PulseClose Risk Methodology</p>
            <h1>{validation.borrower_name}</h1>
            {validation.borrower_entity_name && (
              <p className="rm-sub">
                {validation.borrower_entity_name}
                {validation.guarantor_name && ` (Guarantor: ${validation.guarantor_name})`}
              </p>
            )}
          </div>
          <div className={`rm-tier rm-tier-${tier.toLowerCase()}`}>
            <p className="rm-label">Computed tier</p>
            <p className="rm-tier-value">{tier}</p>
            <p className="rm-tier-rule">
              Rule: any active critical → HIGH; ≥2 moderate → MEDIUM; else LOW
            </p>
          </div>
        </header>
        <p className="rm-validated">
          Validated{" "}
          {validation.validation_date
            ? fmtDate(validation.validation_date)
            : fmtDate(validation.created_at)}
          .
        </p>

        <section className="rm-section">
          <h2>Risk factors ({factors.length})</h2>
          {ordered.length === 0 ? (
            <p className="rm-empty">
              No risk factors recorded. The deterministic engine returned no findings;
              tier defaults to LOW.
            </p>
          ) : (
            <div className="rm-factors">
              {ordered.map((f, i) => (
                <FactorBlock key={f.factor_key + i} factor={f} />
              ))}
            </div>
          )}
        </section>

        <section className="rm-section">
          <h2>Signal override audit trail ({signals.length})</h2>
          {signals.length === 0 ? (
            <p className="rm-empty">No signals applied to this validation.</p>
          ) : (
            <table className="rm-signals">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Scope</th>
                  <th>Signal key</th>
                  <th>Value</th>
                  <th>Property</th>
                  <th>Source</th>
                  <th>Active?</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s, i) => (
                  <tr key={i}>
                    <td>{fmtDate(s.created_at)}</td>
                    <td>{s.scope}</td>
                    <td>
                      <code>{s.signal_key}</code>
                    </td>
                    <td>
                      <code>{JSON.stringify(s.signal_value)}</code>
                    </td>
                    <td>
                      {s.property_id ? propertyMap.get(s.property_id) ?? s.property_id : "—"}
                    </td>
                    <td>{s.source ?? "—"}</td>
                    <td>{s.superseded_at ? "superseded" : "active"}</td>
                    <td>{s.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rm-section">
          <h2>Lender data edits ({edits.length + overrides.length})</h2>
          {edits.length === 0 && overrides.length === 0 ? (
            <p className="rm-empty">
              No lender edits applied. The data above is pure vendor output.
            </p>
          ) : (
            <table className="rm-signals">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Where</th>
                  <th>Action</th>
                  <th>Change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o, i) => (
                  <tr key={`o-${i}`}>
                    <td>{fmtDate(o.updated_at)}</td>
                    <td>
                      <code>factor:{o.factor_key}</code>
                    </td>
                    <td>override</td>
                    <td>excluded from tier</td>
                    <td>{o.exclusion_reason}</td>
                  </tr>
                ))}
                {edits.map((e, i) => {
                  const fmt = (v: unknown) => {
                    if (v === null || v === undefined) return "—";
                    if (typeof v === "string") return v.slice(0, 40);
                    return JSON.stringify(v).slice(0, 40);
                  };
                  return (
                    <tr key={`e-${i}`}>
                      <td>{fmtDate(e.edited_at)}</td>
                      <td>
                        <code>{e.table_name}.{e.field_name}</code>
                      </td>
                      <td>{e.edit_kind}</td>
                      <td>
                        {e.edit_kind === "update"
                          ? `${fmt(e.value_before)} → ${fmt(e.value_after)}`
                          : e.edit_kind === "add"
                            ? "manually added"
                            : "removed by lender"}
                      </td>
                      <td>{e.reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <footer className="rm-footer">
          <p>
            Tier is computed deterministically from the named factors above. The AI
            memo on the validation detail page narrates these factors but does not
            choose the tier. Severity assignments and exclusion rules are codified in{" "}
            <code>src/lib/risk/factors.ts</code>.
          </p>
          <p>
            Generated {fmtDate(new Date().toISOString())} for{" "}
            {validation.borrower_name}. PulseClose validation id{" "}
            <code>{validation.id}</code>.
          </p>
        </footer>
      </body>
    </html>
  );
}

function FactorBlock({ factor }: { factor: RiskFactor }) {
  const color = severityColor(factor.severity, factor.excluded);
  const label = humanizeFactorKey(factor.factor_key);
  const contrib = renderContributingData(
    factor.factor_key,
    factor.contributing_data ?? null,
  );

  return (
    <div className="rm-factor">
      <div className="rm-factor-head">
        <span className="rm-dot" style={{ background: color }} />
        <h3>{label}</h3>
        <span className="rm-severity" style={{ color }}>
          {factor.excluded ? "Excluded" : severityLabel(factor.severity)}
        </span>
        <code className="rm-key">{factor.factor_key}</code>
      </div>
      {factor.explanation && <p className="rm-explanation">{factor.explanation}</p>}
      {factor.excluded && factor.exclusion_reason && (
        <p className="rm-exclusion">
          <strong>Exclusion:</strong> {factor.exclusion_reason}
        </p>
      )}
      {contrib && <p className="rm-contrib">{contrib}</p>}
    </div>
  );
}

const styles = `
  @page { size: letter; margin: 0.75in; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .rm-factor, .rm-signals tbody tr { page-break-inside: avoid; }
    .rm-section { page-break-inside: avoid; }
    .rm-section + .rm-section { page-break-before: auto; }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #0f172a;
    margin: 32px 40px;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .rm-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #0f172a;
    padding-bottom: 14px;
    margin-bottom: 6px;
  }
  .rm-org {
    font-size: 10pt;
    color: #3b82f6;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 4px 0;
  }
  h1 { font-size: 19pt; margin: 0; }
  .rm-sub { font-size: 11pt; color: #475569; margin: 2px 0 0 0; }
  .rm-tier { text-align: right; padding: 8px 14px; border-radius: 8px; min-width: 180px; }
  .rm-tier-low { background: #ecfdf5; }
  .rm-tier-medium { background: #fffbeb; }
  .rm-tier-high { background: #fef2f2; }
  .rm-label {
    font-size: 9pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0;
  }
  .rm-tier-value { font-size: 22pt; font-weight: 800; margin: 2px 0 4px 0; }
  .rm-tier-rule { font-size: 8.5pt; color: #475569; margin: 0; }
  .rm-validated { font-size: 9.5pt; color: #64748b; margin: 4px 0 24px 0; }
  .rm-section { margin-bottom: 24px; }
  .rm-section h2 {
    font-size: 13pt;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    margin-bottom: 10px;
  }
  .rm-toolbar { margin-bottom: 12px; }
  .rm-btn {
    font: inherit;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #0f172a;
    background: #0f172a;
    color: #fff;
    cursor: pointer;
  }
  .rm-btn:hover { background: #1e293b; }
  @media print {
    .rm-toolbar { display: none !important; }
  }
  .rm-empty { color: #64748b; font-style: italic; }
  .rm-factors { display: flex; flex-direction: column; gap: 10px; }
  .rm-factor {
    border: 1px solid #e2e8f0;
    border-left: 4px solid #cbd5e1;
    padding: 10px 12px;
    border-radius: 6px;
  }
  .rm-factor-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rm-factor-head h3 { font-size: 11.5pt; margin: 0; }
  .rm-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .rm-severity { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
  .rm-key { font-size: 8.5pt; color: #94a3b8; margin-left: auto; }
  .rm-explanation { font-size: 10pt; margin: 6px 0 0 0; }
  .rm-exclusion { font-size: 9pt; color: #475569; margin: 4px 0 0 0; }
  .rm-contrib { font-size: 9pt; color: #64748b; margin: 4px 0 0 0; }
  .rm-signals { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .rm-signals th {
    text-align: left;
    background: #0f172a;
    color: #fff;
    padding: 6px 8px;
    font-weight: 600;
  }
  .rm-signals td {
    padding: 5px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .rm-signals code { font-size: 8pt; background: #f1f5f9; padding: 1px 3px; border-radius: 3px; }
  .rm-footer {
    margin-top: 30px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #64748b;
  }
  .rm-footer p { margin: 0 0 4px 0; }
`;
