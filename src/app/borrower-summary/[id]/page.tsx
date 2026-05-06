// A3 — Borrower capital-availability summary (printable).
// Server-rendered HTML with print CSS. Lender prints via Cmd+P → Save as
// PDF, then shares with the borrower.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import {
  buildBorrowerSummaryDoc,
  type BorrowerSummaryDoc,
  type BorrowerSummaryInvestor,
} from "@/lib/borrower-summary/builder";
import { PrintToolbar } from "./print-toolbar";

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

function fmtRate(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

function loanTypeLabel(t: string): string {
  if (t === "fix_flip") return "Fix & Flip";
  if (t === "ground_up") return "Ground-Up Construction";
  if (t === "dscr") return "DSCR";
  if (t === "bridge") return "Bridge";
  return t;
}

function propertyTypeLabel(t: string): string {
  return t.replace(/_/g, " ");
}

function ResultPill({ result }: { result: "pass" | "conditional" }) {
  if (result === "pass") {
    return <span className="bs-pill bs-pill-pass">Eligible</span>;
  }
  return <span className="bs-pill bs-pill-cond">Conditional</span>;
}

function InvestorCard({ inv }: { inv: BorrowerSummaryInvestor }) {
  return (
    <div className="bs-investor">
      <div className="bs-investor-head">
        <p className="bs-investor-name">{inv.investor_name}</p>
        <ResultPill result={inv.result} />
      </div>
      <div className="bs-investor-grid">
        <div>
          <p className="bs-label">Estimated rate</p>
          <p className="bs-stat">{fmtRate(inv.estimated_rate_pct)}</p>
        </div>
        <div>
          <p className="bs-label">Points</p>
          <p className="bs-stat">{inv.estimated_points != null ? inv.estimated_points.toFixed(2) : "—"}</p>
        </div>
        <div>
          <p className="bs-label">Max LTV</p>
          <p className="bs-stat">{fmtPct(inv.max_ltv)}</p>
        </div>
        <div>
          <p className="bs-label">Max LTC</p>
          <p className="bs-stat">{fmtPct(inv.max_ltc)}</p>
        </div>
        <div>
          <p className="bs-label">Max LTARV</p>
          <p className="bs-stat">{fmtPct(inv.max_ltarv)}</p>
        </div>
      </div>
      {inv.reasoning && <p className="bs-reasoning">{inv.reasoning}</p>}
      {inv.boundary_warnings.length > 0 && (
        <ul className="bs-warnings">
          {inv.boundary_warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryBody({ doc }: { doc: BorrowerSummaryDoc }) {
  const totalEligible = doc.pass_count + doc.conditional_count;
  return (
    <>
      <header className="bs-header">
        <div>
          <p className="bs-org">{doc.org_name}</p>
          <h1>Capital availability summary</h1>
          <p className="bs-borrower">
            {doc.borrower_name ? <strong>{doc.borrower_name}</strong> : <em>Borrower</em>}
            {doc.property_address && ` — ${doc.property_address}`}
            {doc.property_state && ` (${doc.property_state})`}
          </p>
        </div>
        <div className="bs-meta">
          <p>Generated {doc.generated_at.slice(0, 10)}</p>
          <p>Reference {doc.evaluation_id.slice(0, 8)}</p>
        </div>
      </header>

      <section className="bs-section">
        <div className="bs-summary-grid">
          <div className="bs-stat-block bs-stat-eligible">
            <p className="bs-label">Eligible lenders</p>
            <p className="bs-stat-big">{totalEligible}</p>
            <p className="bs-stat-sub">
              {doc.pass_count} confirmed{doc.conditional_count > 0 && `, ${doc.conditional_count} conditional`}
            </p>
          </div>
          <div className="bs-stat-block">
            <p className="bs-label">Loan amount</p>
            <p className="bs-stat-big">{fmtMoney(doc.loan_amount)}</p>
            <p className="bs-stat-sub">{loanTypeLabel(doc.loan_type)}</p>
          </div>
          <div className="bs-stat-block">
            <p className="bs-label">Property</p>
            <p className="bs-stat-big">{propertyTypeLabel(doc.property_type)}</p>
            <p className="bs-stat-sub">{doc.property_state}</p>
          </div>
          <div className="bs-stat-block">
            <p className="bs-label">Purchase / ARV</p>
            <p className="bs-stat-big">{fmtMoney(doc.purchase_price)}</p>
            <p className="bs-stat-sub">ARV {fmtMoney(doc.arv)}</p>
          </div>
        </div>
      </section>

      {doc.eligible.length === 0 ? (
        <section className="bs-section">
          <div className="bs-empty">
            <p>No eligible lenders yet for this scenario.</p>
            <p className="bs-stat-sub">Adjustments to loan structure or borrower profile may surface options.</p>
          </div>
        </section>
      ) : (
        <section className="bs-section">
          <h2>Available capital ({totalEligible})</h2>
          <div className="bs-investors">
            {doc.eligible.map((inv) => (
              <InvestorCard key={inv.investor_id} inv={inv} />
            ))}
          </div>
        </section>
      )}

      <footer className="bs-footer">
        <p>
          Indicative terms only. Subject to underwriting, appraisal, and final
          borrower documentation. Generated by {doc.org_name} via PulseClose on {doc.generated_at.slice(0, 10)}.
        </p>
      </footer>

      <style>{BS_STYLES}</style>
    </>
  );
}

const BS_STYLES = `
  @page { size: letter; margin: 0.6in 0.5in; }
  @media print {
    .bs-print-hide { display: none !important; }
    .page-break { page-break-before: always; }
  }
  body, .bs-root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #fff;
    margin: 0;
    padding: 1rem 1.25rem;
    font-size: 11pt;
    line-height: 1.4;
  }
  .bs-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #0f172a;
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
  }
  .bs-org { color: #3b82f6; font-weight: 700; font-size: 9pt; letter-spacing: 0.05em; text-transform: uppercase; margin: 0; }
  h1 { font-size: 18pt; margin: 0.25rem 0 0.25rem; }
  h2 { font-size: 13pt; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.2rem; margin: 1.25rem 0 0.5rem; }
  .bs-borrower { margin: 0.15rem 0 0; font-size: 11pt; color: #475569; }
  .bs-meta { text-align: right; font-size: 9pt; color: #64748b; }
  .bs-meta p { margin: 0.1rem 0; }
  .bs-section { break-inside: avoid; margin-bottom: 0.75rem; }
  .bs-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
  .bs-stat-block { padding: 0.6rem; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; }
  .bs-stat-eligible { background: #ecfdf5; border-color: #6ee7b7; }
  .bs-stat-big { font-size: 18pt; font-weight: 700; margin: 0.15rem 0; }
  .bs-stat-sub { font-size: 8.5pt; color: #64748b; margin: 0; }
  .bs-label { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; font-weight: 600; }
  .bs-investors { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
  .bs-investor { padding: 0.6rem; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; break-inside: avoid; }
  .bs-investor-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
  .bs-investor-name { font-weight: 600; font-size: 11pt; margin: 0; }
  .bs-investor-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.3rem; padding-bottom: 0.3rem; border-bottom: 1px solid #f1f5f9; }
  .bs-stat { font-size: 11pt; font-weight: 600; margin: 0.1rem 0 0; }
  .bs-pill { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 8.5pt; font-weight: 600; }
  .bs-pill-pass { background: #10b981; color: #fff; }
  .bs-pill-cond { background: #f59e0b; color: #fff; }
  .bs-reasoning { margin: 0.4rem 0 0; font-size: 9pt; color: #475569; line-height: 1.35; }
  .bs-warnings { margin: 0.3rem 0 0; padding-left: 1rem; font-size: 8.5pt; color: #b45309; }
  .bs-empty { padding: 1rem; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; }
  .bs-empty p { margin: 0.15rem 0; }
  .bs-footer { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid #cbd5e1; font-size: 8pt; color: #64748b; text-align: center; }
  .bs-toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  .bs-toolbar button { font: inherit; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #0f172a; background: #0f172a; color: #fff; cursor: pointer; }
  .bs-toolbar button.bs-secondary { background: #fff; color: #0f172a; }
`;

export default async function BorrowerSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) notFound();
  const supabase = createAdminClient();
  const doc = await buildBorrowerSummaryDoc(supabase, id, profile.org_id);
  if (!doc) notFound();
  return (
    <div className="bs-root">
      <PrintToolbar />
      <SummaryBody doc={doc} />
    </div>
  );
}
