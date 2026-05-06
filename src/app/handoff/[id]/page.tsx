// Printable handoff page — server-rendered HTML optimized for print
// (Cmd+P → Save as PDF). No sidebar, no nav, branded header, page
// breaks between sections.
//
// This route is auth-gated via the validation's RLS — we use the
// admin client server-side after confirming the caller's org via the
// session.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { buildHandoffDocument, type HandoffDocument } from "@/lib/handoff/builder";
import { emitActivity } from "@/lib/events/emit";

export const dynamic = "force-dynamic";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

function severityColor(severity: string, excluded: boolean): string {
  if (excluded) return "#94a3b8";
  if (severity === "critical") return "#b91c1c";
  if (severity === "moderate") return "#b45309";
  if (severity === "minor") return "#0369a1";
  return "#475569";
}

function HandoffBody({ doc }: { doc: HandoffDocument }) {
  return (
    <>
      <header className="hf-header">
        <div>
          <p className="hf-org">{doc.org_name}</p>
          <h1>Borrower Validation Handoff</h1>
          <p className="hf-borrower">
            <strong>{doc.borrower_name}</strong>
            {doc.entity_name && ` — ${doc.entity_name}`}
            {doc.guarantor_name && ` (Guarantor: ${doc.guarantor_name})`}
          </p>
        </div>
        <div className="hf-meta">
          <p>Generated {doc.generated_at.slice(0, 10)}</p>
          {doc.preparer_name && <p>Prepared by {doc.preparer_name}</p>}
          {doc.preparer_email && <p>{doc.preparer_email}</p>}
        </div>
      </header>

      <section className="hf-section">
        <div className="hf-summary-grid">
          <div className={`hf-tier hf-tier-${doc.tier.toLowerCase()}`}>
            <p className="hf-label">Risk tier</p>
            <p className="hf-tier-value">{doc.tier}</p>
          </div>
          <div className="hf-stat">
            <p className="hf-label">Properties on record</p>
            <p className="hf-stat-value">{doc.summary.property_count}</p>
            <p className="hf-stat-sub">{doc.summary.current_holdings} held / {doc.summary.completed_sales} sold</p>
          </div>
          <div className="hf-stat">
            <p className="hf-label">Portfolio value (held)</p>
            <p className="hf-stat-value">{fmtMoney(doc.summary.estimated_portfolio_value)}</p>
            <p className="hf-stat-sub">avg LTV {fmtPct(doc.summary.avg_current_ltv_pct)}</p>
          </div>
          <div className="hf-stat">
            <p className="hf-label">Realized profit (sold)</p>
            <p className="hf-stat-value">{fmtMoney(doc.summary.realized_profit)}</p>
            <p className="hf-stat-sub">verified count: {doc.verified_property_count}</p>
          </div>
        </div>
      </section>

      <section className="hf-section">
        <h2>Borrower profile</h2>
        <table className="hf-kv">
          <tbody>
            <tr><th>Borrower</th><td>{doc.borrower_name}</td></tr>
            <tr><th>Entity</th><td>{doc.entity_name ?? "—"}</td></tr>
            {doc.guarantor_name && <tr><th>Guarantor</th><td>{doc.guarantor_name}</td></tr>}
            <tr><th>Entity SOS status</th><td>{doc.entity?.sos_status ?? "—"}</td></tr>
            <tr><th>Entity state</th><td>{doc.entity?.state ?? "—"}</td></tr>
            <tr><th>Formation date</th><td>{fmtDate(doc.entity?.formation_date ?? null)}</td></tr>
            <tr><th>Last filing</th><td>{fmtDate(doc.entity?.last_filing_date ?? null)}</td></tr>
            <tr><th>Registered agent</th><td>{doc.entity?.registered_agent ?? "—"}</td></tr>
            <tr><th>Validation date</th><td>{fmtDate(doc.validation_date)}</td></tr>
            <tr><th>Experience tier</th><td>{doc.experience_tier ? `Tier ${doc.experience_tier}` : "—"}</td></tr>
            <tr><th>Completeness score</th><td>{doc.confidence_score != null ? `${doc.confidence_score}%` : "—"}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="hf-section">
        <h2>Risk factors</h2>
        {doc.risk_factors.length === 0 ? (
          <p className="hf-muted">No factors flagged.</p>
        ) : (
          <ul className="hf-factors">
            {doc.risk_factors.map((f, i) => (
              <li key={i} style={{ color: severityColor(f.severity, f.excluded) }}>
                <strong>{f.factor_key}</strong>{" "}
                <span className="hf-sev">
                  ({f.excluded ? `excluded${f.exclusion_reason ? ` — ${f.exclusion_reason}` : ""}` : f.severity})
                </span>
                : {f.explanation}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hf-section">
        <h2>Litigation & sanctions</h2>
        <table className="hf-kv">
          <tbody>
            <tr>
              <th>Sanctions / PEP</th>
              <td>
                {doc.sanctions
                  ? `${doc.sanctions.result} (${doc.sanctions.match_count} match${doc.sanctions.match_count === 1 ? "" : "es"} across ${doc.sanctions.sources_searched.length} sources)`
                  : "Not run"}
              </td>
            </tr>
            <tr>
              <th>Federal litigation</th>
              <td>
                {doc.litigation.length === 0
                  ? "Clear (CourtListener, federal courts)"
                  : `${doc.litigation.filter((l) => l.status === "active").length} active, ${doc.litigation.filter((l) => l.status === "dismissed").length} dismissed`}
              </td>
            </tr>
          </tbody>
        </table>
        {doc.litigation.length > 0 && (
          <ul className="hf-list">
            {doc.litigation.map((l, i) => (
              <li key={i}>
                <strong>{l.search_type}</strong> — {l.status ?? l.result}
                {l.case_number && ` — ${l.case_number}`}
                {l.details && `: ${l.details}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hf-section page-break">
        <h2>Property track record</h2>
        <p className="hf-muted">
          One row per deeded ownership episode. Sources: Realie deed records + lender-side verification.
          {doc.verified_property_count > 0 && ` ${doc.verified_property_count} property${doc.verified_property_count === 1 ? "" : "ies"} confirmed via deed-chain verification.`}
        </p>
        <table className="hf-properties">
          <thead>
            <tr>
              <th>Address</th>
              <th>Acquired</th>
              <th>Acquisition $</th>
              <th>Sold</th>
              <th>Disposition $</th>
              <th>Hold (mo)</th>
              <th>Profit</th>
              <th>Lender</th>
              <th>Rehab $</th>
              <th>GC</th>
              <th>Narrative</th>
            </tr>
          </thead>
          <tbody>
            {doc.properties.map((p, i) => (
              <tr key={i}>
                <td>
                  {p.address}
                  {(p.city || p.state) && (
                    <div className="hf-sub">
                      {[p.city, p.state, p.zip].filter(Boolean).join(", ")}
                    </div>
                  )}
                </td>
                <td>{fmtDate(p.acquisition_date)}</td>
                <td>{fmtMoney(p.acquisition_price)}</td>
                <td>{p.disposition_date ? fmtDate(p.disposition_date) : "—"}</td>
                <td>{p.disposition_price != null ? fmtMoney(p.disposition_price) : "—"}</td>
                <td>{p.hold_months ?? "—"}</td>
                <td>{p.profit != null ? fmtMoney(p.profit) : "—"}</td>
                <td>
                  {p.lender_name ?? "—"}
                  {p.lender_classification && (
                    <div className="hf-sub">{p.lender_classification}</div>
                  )}
                </td>
                <td>{p.rehab_spend != null ? fmtMoney(p.rehab_spend) : <span className="hf-blank">—</span>}</td>
                <td>
                  {p.gc_name ?? <span className="hf-blank">—</span>}
                  {p.gc_license && <div className="hf-sub">{p.gc_license}</div>}
                </td>
                <td>{p.narrative ?? <span className="hf-blank">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* G6.1 — Intended investor block when one was chosen on the
          handoff card. Renders before the narrative so the audience
          (investor or the originator's contact at one) sees their
          terms in context. */}
      {doc.intended_investor && (
        <section className="hf-section">
          <h2>Intended investor</h2>
          <div className="hf-investor">
            <p>
              <strong>{doc.intended_investor.display_name}</strong>
              {doc.intended_investor.result && (
                <span className={`hf-elig hf-elig-${doc.intended_investor.result}`}>
                  {" "}
                  · {doc.intended_investor.result}
                </span>
              )}
            </p>
            <ul className="hf-investor-terms">
              {doc.intended_investor.rate != null && (
                <li>
                  Quoted rate: <strong>{doc.intended_investor.rate}%</strong>
                </li>
              )}
              {doc.intended_investor.points != null && (
                <li>
                  Points: <strong>{doc.intended_investor.points}</strong>
                </li>
              )}
              {doc.intended_investor.max_ltv_pct != null && (
                <li>
                  Max LTV: <strong>{doc.intended_investor.max_ltv_pct}%</strong>
                </li>
              )}
              {doc.intended_investor.max_loan_amount != null && (
                <li>
                  Max loan amount:{" "}
                  <strong>
                    ${doc.intended_investor.max_loan_amount.toLocaleString()}
                  </strong>
                </li>
              )}
              {doc.intended_investor.computed_at && (
                <li>
                  Evaluated:{" "}
                  {doc.intended_investor.computed_at.slice(0, 10)}
                </li>
              )}
            </ul>
            {doc.intended_investor.rationale && (
              <p className="hf-narrative">{doc.intended_investor.rationale}</p>
            )}
          </div>
        </section>
      )}

      {doc.overall_narrative && (
        <section className="hf-section">
          <h2>Project narrative</h2>
          <p className="hf-narrative">{doc.overall_narrative}</p>
        </section>
      )}

      {/* Lender edit audit trail. Renders only when at least one edit
          was applied. The investor sees the data isn't pure vendor
          truth — every change is timestamped + reasoned. */}
      {doc.lender_edits.total > 0 && (
        <section className="hf-section">
          <h2>Lender edits applied</h2>
          <div className="hf-edit-summary">
            {doc.lender_edits.track_record_edits > 0 && (
              <span>{doc.lender_edits.track_record_edits} track-record edit{doc.lender_edits.track_record_edits === 1 ? "" : "s"}</span>
            )}
            {doc.lender_edits.track_record_adds > 0 && (
              <span>{doc.lender_edits.track_record_adds} track-record addition{doc.lender_edits.track_record_adds === 1 ? "" : "s"}</span>
            )}
            {doc.lender_edits.track_record_deletes > 0 && (
              <span>{doc.lender_edits.track_record_deletes} track-record removal{doc.lender_edits.track_record_deletes === 1 ? "" : "s"}</span>
            )}
            {doc.lender_edits.litigation_edits > 0 && (
              <span>{doc.lender_edits.litigation_edits} litigation edit{doc.lender_edits.litigation_edits === 1 ? "" : "s"}</span>
            )}
            {doc.lender_edits.litigation_adds > 0 && (
              <span>{doc.lender_edits.litigation_adds} litigation addition{doc.lender_edits.litigation_adds === 1 ? "" : "s"}</span>
            )}
            {doc.lender_edits.litigation_deletes > 0 && (
              <span>{doc.lender_edits.litigation_deletes} litigation removal{doc.lender_edits.litigation_deletes === 1 ? "" : "s"}</span>
            )}
            {doc.lender_edits.factor_overrides > 0 && (
              <span>{doc.lender_edits.factor_overrides} factor override{doc.lender_edits.factor_overrides === 1 ? "" : "s"}</span>
            )}
          </div>
          <p className="hf-muted">
            The data presented above reflects the lender-corrected view.
            Vendor data is treated as ground truth except where the
            lender had direct domain knowledge to overrule. Full trail:
          </p>
          <table className="hf-edits">
            <thead>
              <tr>
                <th>When</th>
                <th>What changed</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {doc.lender_edits.events.map((ev, i) => (
                <tr key={i}>
                  <td className="hf-mono">{ev.edited_at.slice(0, 16).replace("T", " ")}</td>
                  <td>
                    <span className="hf-edit-kind">{ev.edit_kind}</span>{" "}
                    <span className="hf-mono">{ev.table_name}.{ev.field_name}</span>
                    {ev.value_summary && (
                      <div className="hf-mono hf-sub">{ev.value_summary}</div>
                    )}
                  </td>
                  <td>
                    {ev.exclusion_reason ? (
                      <>
                        <span className="hf-sub">Factor exclusion:</span>{" "}
                        {ev.exclusion_reason}
                      </>
                    ) : ev.edit_reason ? (
                      ev.edit_reason
                    ) : (
                      <span className="hf-blank">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="hf-footer">
        <p>Generated by PulseClose for {doc.org_name} on {doc.generated_at.slice(0, 10)}.</p>
      </footer>

      <style>{HF_STYLES}</style>
    </>
  );
}

const HF_STYLES = `
  @page { size: letter; margin: 0.6in 0.5in; }
  @media print {
    .hf-print-only { display: block !important; }
    .page-break { page-break-before: always; }
  }
  body, .hf-root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #fff;
    margin: 0;
    padding: 1rem 1.25rem;
    font-size: 11pt;
    line-height: 1.4;
  }
  .hf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #0f172a;
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
  }
  .hf-org { color: #3b82f6; font-weight: 700; font-size: 9pt; letter-spacing: 0.05em; text-transform: uppercase; margin: 0; }
  h1 { font-size: 18pt; margin: 0.25rem 0 0.25rem; }
  h2 { font-size: 13pt; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.2rem; margin: 1.25rem 0 0.5rem; }
  .hf-borrower { margin: 0.15rem 0 0; font-size: 11pt; color: #475569; }
  .hf-meta { text-align: right; font-size: 9pt; color: #64748b; }
  .hf-meta p { margin: 0.1rem 0; }
  .hf-section { break-inside: avoid; margin-bottom: 0.75rem; }
  .hf-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
  .hf-tier { padding: 0.6rem; border-radius: 6px; }
  .hf-tier-low { background: #ecfdf5; border: 1px solid #6ee7b7; }
  .hf-tier-medium { background: #fffbeb; border: 1px solid #fcd34d; }
  .hf-tier-high { background: #fef2f2; border: 1px solid #fca5a5; }
  .hf-tier-value { font-size: 22pt; font-weight: 700; margin: 0.15rem 0 0; }
  .hf-stat { padding: 0.6rem; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; }
  .hf-stat-value { font-size: 14pt; font-weight: 700; margin: 0.15rem 0; }
  .hf-stat-sub { font-size: 8.5pt; color: #64748b; margin: 0; }
  .hf-label { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; font-weight: 600; }
  table.hf-kv { border-collapse: collapse; width: 100%; }
  table.hf-kv th { text-align: left; font-weight: 600; color: #475569; width: 30%; padding: 0.2rem 0.5rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  table.hf-kv td { padding: 0.2rem 0.5rem; border-bottom: 1px solid #e2e8f0; }
  ul.hf-factors { padding-left: 1.1rem; margin: 0.25rem 0; }
  ul.hf-factors li { margin-bottom: 0.25rem; }
  ul.hf-list { padding-left: 1.1rem; margin: 0.25rem 0; }
  .hf-sev { color: #64748b; font-size: 9pt; }
  .hf-muted { color: #64748b; font-size: 9.5pt; }
  table.hf-properties { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.hf-properties th { background: #0f172a; color: #fff; padding: 0.35rem 0.4rem; text-align: left; }
  table.hf-properties td { padding: 0.3rem 0.4rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  table.hf-properties tr:nth-child(even) td { background: #f8fafc; }
  .hf-sub { font-size: 7.5pt; color: #64748b; margin-top: 0.1rem; }
  .hf-blank { color: #94a3b8; font-style: italic; }
  .hf-narrative { white-space: pre-wrap; padding: 0.5rem; background: #f8fafc; border-left: 3px solid #3b82f6; }
  .hf-investor { padding: 0.5rem 0.75rem; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; }
  .hf-investor-terms { padding-left: 1.1rem; margin: 0.4rem 0; column-count: 2; column-gap: 1rem; }
  .hf-investor-terms li { break-inside: avoid; margin-bottom: 0.2rem; }
  .hf-elig { font-size: 9pt; }
  .hf-elig-pass { color: #047857; }
  .hf-elig-conditional { color: #b45309; }
  .hf-elig-fail { color: #b91c1c; }
  .hf-edit-summary { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 9pt; margin-bottom: 0.4rem; }
  .hf-edit-summary span { padding: 0.1rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; }
  table.hf-edits { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 0.4rem; }
  table.hf-edits th { background: #f1f5f9; padding: 0.3rem 0.4rem; text-align: left; border-bottom: 1px solid #cbd5e1; }
  table.hf-edits td { padding: 0.3rem 0.4rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .hf-edit-kind { display: inline-block; padding: 0 0.4rem; border-radius: 3px; background: #dbeafe; color: #1e3a8a; font-size: 7.5pt; text-transform: uppercase; }
  .hf-mono { font-family: ui-monospace, "SF Mono", monospace; font-size: 8.5pt; }
  .hf-footer { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid #cbd5e1; font-size: 8pt; color: #64748b; text-align: center; }
`;

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) notFound();
  const supabase = createAdminClient();
  const doc = await buildHandoffDocument(supabase, id, profile.org_id);
  if (!doc) notFound();
  // Fire activity event for the PDF view path (B5 feed). Excel download
  // emits the same verb from /api/handoff/[id]/excel; metadata.artifact
  // distinguishes them.
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "sent_handoff",
    subjectType: "validation",
    subjectId: id,
    metadata: { artifact: "pdf" },
  });
  return (
    <div className="hf-root">
      <HandoffBody doc={doc} />
    </div>
  );
}
