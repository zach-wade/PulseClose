// Excel generator for the investor handoff. Two sheets:
//   1. Cover — borrower header, summary stats, tier, risk factor list
//   2. Properties — one row per property (deeded ownership episode)
//      with auto-pulled fields + manual cells (rehab spend, GC details,
//      narrative) prefilled from handoff_data when present, blank
//      otherwise so lenders can fill them in Excel.

import ExcelJS from "exceljs";
import type { HandoffDocument, HandoffPropertyRow } from "./builder";

const PRIMARY = "FF0F172A";        // Navy 950
const ACCENT = "FF3B82F6";         // Blue 500
const MUTED = "FF64748B";          // Slate 500
const LIGHT_FILL = "FFF1F5F9";     // Slate 100

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 10);
}
function fmtMoney(n: number | null | undefined): string | number {
  if (n == null) return "—";
  return Math.round(n);
}

export async function generateHandoffWorkbook(doc: HandoffDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.org_name;
  wb.created = new Date(doc.generated_at);
  wb.title = `Borrower Handoff — ${doc.borrower_name}`;

  // ── Cover sheet ─────────────────────────────────────────────────────────
  const cover = wb.addWorksheet("Cover", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: "&CPage &P of &N" },
    properties: { defaultColWidth: 20 },
  });
  cover.getColumn(1).width = 30;
  cover.getColumn(2).width = 50;

  const title = cover.addRow([`${doc.borrower_name} — Borrower Validation Handoff`]);
  title.font = { size: 18, bold: true, color: { argb: PRIMARY } };
  cover.mergeCells(`A${title.number}:B${title.number}`);

  const subtitle = cover.addRow([`${doc.org_name} — generated ${doc.generated_at.slice(0, 10)}`]);
  subtitle.font = { size: 10, color: { argb: MUTED } };
  cover.mergeCells(`A${subtitle.number}:B${subtitle.number}`);
  cover.addRow([]);

  const headerRow = cover.addRow(["Borrower Profile"]);
  headerRow.font = { size: 12, bold: true, color: { argb: ACCENT } };
  cover.mergeCells(`A${headerRow.number}:B${headerRow.number}`);

  const profile: Array<[string, string | number | null]> = [
    ["Borrower", doc.borrower_name],
    ["Entity", doc.entity_name ?? "—"],
    ["Guarantor", doc.guarantor_name ?? "—"],
    ["Entity SOS status", doc.entity?.sos_status ?? "—"],
    ["Entity state", doc.entity?.state ?? "—"],
    ["Entity formation", doc.entity?.formation_date ?? "—"],
    ["Last filing", doc.entity?.last_filing_date ?? "—"],
    ["Registered agent", doc.entity?.registered_agent ?? "—"],
    ["Validation date", doc.validation_date ? doc.validation_date.slice(0, 10) : "—"],
    ["Overall status", doc.overall_status],
    ["Risk tier", doc.tier],
    ["Experience tier", doc.experience_tier ? `Tier ${doc.experience_tier}` : "—"],
    ["Completeness score", doc.confidence_score != null ? `${doc.confidence_score}%` : "—"],
  ];
  for (const [label, value] of profile) {
    const r = cover.addRow([label, value ?? "—"]);
    r.getCell(1).font = { bold: true };
  }
  cover.addRow([]);

  // Summary stats
  const summaryHeader = cover.addRow(["Track Record Summary"]);
  summaryHeader.font = { size: 12, bold: true, color: { argb: ACCENT } };
  cover.mergeCells(`A${summaryHeader.number}:B${summaryHeader.number}`);
  const summaryRows: Array<[string, string | number]> = [
    ["Total properties on record", doc.summary.property_count],
    ["Currently held", doc.summary.current_holdings],
    ["Completed sales", doc.summary.completed_sales],
    ["Verified (deed-confirmed)", doc.verified_property_count],
    ["Estimated portfolio value", doc.summary.estimated_portfolio_value != null ? `$${fmtMoney(doc.summary.estimated_portfolio_value).toLocaleString()}` : "—"],
    ["Realized profit (sold)", doc.summary.realized_profit != null ? `$${fmtMoney(doc.summary.realized_profit).toLocaleString()}` : "—"],
    ["Avg current LTV", doc.summary.avg_current_ltv_pct != null ? `${doc.summary.avg_current_ltv_pct.toFixed(1)}%` : "—"],
    ["Longest current hold", doc.summary.longest_hold_months != null ? `${doc.summary.longest_hold_months} months` : "—"],
  ];
  for (const [label, value] of summaryRows) {
    const r = cover.addRow([label, value]);
    r.getCell(1).font = { bold: true };
  }
  cover.addRow([]);

  // Risk factors
  const riskHeader = cover.addRow(["Risk Factors"]);
  riskHeader.font = { size: 12, bold: true, color: { argb: ACCENT } };
  cover.mergeCells(`A${riskHeader.number}:B${riskHeader.number}`);
  if (doc.risk_factors.length === 0) {
    cover.addRow(["—", "No factors flagged"]);
  } else {
    for (const f of doc.risk_factors) {
      const status = f.excluded ? `excluded${f.exclusion_reason ? ` — ${f.exclusion_reason}` : ""}` : f.severity;
      const r = cover.addRow([`${f.factor_key} (${status})`, f.explanation ?? ""]);
      if (f.excluded || f.severity === "informational" || f.severity === "none") {
        r.font = { color: { argb: MUTED } };
      } else if (f.severity === "critical") {
        r.font = { color: { argb: "FFB91C1C" } };
      } else if (f.severity === "moderate") {
        r.font = { color: { argb: "FFB45309" } };
      }
    }
  }
  cover.addRow([]);

  // Litigation + sanctions
  const lsHeader = cover.addRow(["Litigation & Sanctions"]);
  lsHeader.font = { size: 12, bold: true, color: { argb: ACCENT } };
  cover.mergeCells(`A${lsHeader.number}:B${lsHeader.number}`);
  cover.addRow(["Sanctions / PEP", doc.sanctions
    ? `${doc.sanctions.result} (${doc.sanctions.match_count} match${doc.sanctions.match_count === 1 ? "" : "es"} across ${doc.sanctions.sources_searched.length} sources)`
    : "Not run"]);
  if (doc.litigation.length === 0) {
    cover.addRow(["Federal litigation", "Clear"]);
  } else {
    const active = doc.litigation.filter((l) => l.status === "active");
    const dismissed = doc.litigation.filter((l) => l.status === "dismissed");
    cover.addRow(["Active federal cases", active.length]);
    cover.addRow(["Dismissed federal cases", dismissed.length]);
    for (const l of doc.litigation) {
      cover.addRow([
        `  ${l.search_type} (${l.status ?? l.result})`,
        `${l.case_number ?? "—"} ${l.details ?? ""}`.trim(),
      ]);
    }
  }
  cover.addRow([]);

  // G6.1 — Intended investor block. Only renders when one was chosen.
  if (doc.intended_investor) {
    cover.addRow([]);
    const invHeader = cover.addRow(["Intended Investor"]);
    invHeader.font = { size: 12, bold: true, color: { argb: ACCENT } };
    cover.mergeCells(`A${invHeader.number}:B${invHeader.number}`);
    const inv = doc.intended_investor;
    const invRows: Array<[string, string]> = [
      ["Investor", inv.display_name],
    ];
    if (inv.result) {
      invRows.push(["Eligibility", inv.result]);
    }
    if (inv.rate != null) invRows.push(["Quoted rate", `${inv.rate}%`]);
    if (inv.points != null) invRows.push(["Points", String(inv.points)]);
    if (inv.max_ltv_pct != null) invRows.push(["Max LTV", `${inv.max_ltv_pct}%`]);
    if (inv.max_loan_amount != null)
      invRows.push(["Max loan amount", `$${fmtMoney(inv.max_loan_amount).toLocaleString()}`]);
    if (inv.computed_at)
      invRows.push(["Evaluated", inv.computed_at.slice(0, 10)]);
    for (const [label, value] of invRows) {
      const r = cover.addRow([label, value]);
      r.getCell(1).font = { bold: true };
    }
    if (inv.rationale) {
      const ratRow = cover.addRow([inv.rationale, ""]);
      ratRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
      cover.mergeCells(`A${ratRow.number}:B${ratRow.number}`);
      ratRow.height = 40;
    }
  }

  // Overall narrative (manual input via UI)
  if (doc.overall_narrative) {
    const narrHeader = cover.addRow(["Project Narrative"]);
    narrHeader.font = { size: 12, bold: true, color: { argb: ACCENT } };
    cover.mergeCells(`A${narrHeader.number}:B${narrHeader.number}`);
    const narrRow = cover.addRow([doc.overall_narrative, ""]);
    narrRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    cover.mergeCells(`A${narrRow.number}:B${narrRow.number}`);
    narrRow.height = 60;
  }

  // Preparer
  if (doc.preparer_name || doc.preparer_email) {
    cover.addRow([]);
    cover.addRow(["Prepared by", `${doc.preparer_name ?? ""}${doc.preparer_email ? ` <${doc.preparer_email}>` : ""}`]);
  }

  // Lender edits — provenance for the receiving investor. Only renders
  // when there's at least one edit/override on this validation.
  if (doc.lender_edits.total > 0) {
    cover.addRow([]);
    const editsHeader = cover.addRow(["Lender Edits Applied"]);
    editsHeader.font = { size: 12, bold: true, color: { argb: ACCENT } };
    cover.mergeCells(`A${editsHeader.number}:B${editsHeader.number}`);

    const summary: Array<[string, string]> = [];
    if (doc.lender_edits.track_record_edits) {
      summary.push(["Track-record edits", String(doc.lender_edits.track_record_edits)]);
    }
    if (doc.lender_edits.track_record_adds) {
      summary.push(["Track-record additions", String(doc.lender_edits.track_record_adds)]);
    }
    if (doc.lender_edits.track_record_deletes) {
      summary.push(["Track-record removals", String(doc.lender_edits.track_record_deletes)]);
    }
    if (doc.lender_edits.litigation_edits) {
      summary.push(["Litigation edits", String(doc.lender_edits.litigation_edits)]);
    }
    if (doc.lender_edits.litigation_adds) {
      summary.push(["Litigation additions", String(doc.lender_edits.litigation_adds)]);
    }
    if (doc.lender_edits.litigation_deletes) {
      summary.push(["Litigation removals", String(doc.lender_edits.litigation_deletes)]);
    }
    if (doc.lender_edits.factor_overrides) {
      summary.push(["Factor overrides", String(doc.lender_edits.factor_overrides)]);
    }
    for (const [label, value] of summary) {
      const r = cover.addRow([label, value]);
      r.getCell(1).font = { bold: true };
    }
    const noteRow = cover.addRow([
      "Note",
      "The Properties / Public records / Risk factors sheets reflect the lender-corrected view. Full audit trail with timestamps and reasons is on the Audit Log sheet.",
    ]);
    noteRow.getCell(2).alignment = { wrapText: true };
    noteRow.height = 36;
  }

  // ── Audit Log sheet — only when there are edits to log ───────────────────
  if (doc.lender_edits.events.length > 0) {
    const audit = wb.addWorksheet("Audit Log", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
      headerFooter: { oddFooter: "&CPage &P of &N" },
    });
    audit.columns = [
      { header: "When", key: "edited_at", width: 20 },
      { header: "Table", key: "table_name", width: 22 },
      { header: "Field", key: "field_name", width: 24 },
      { header: "Action", key: "edit_kind", width: 10 },
      { header: "Change", key: "value_summary", width: 36 },
      { header: "Reason", key: "reason", width: 50 },
    ];
    audit.getRow(1).font = { bold: true };
    for (const ev of doc.lender_edits.events) {
      audit.addRow({
        edited_at: ev.edited_at.slice(0, 19).replace("T", " "),
        table_name: ev.table_name,
        field_name: ev.field_name,
        edit_kind: ev.edit_kind,
        value_summary: ev.value_summary ?? "",
        reason: ev.reason ?? "",
      });
    }
  }

  // ── Properties sheet ────────────────────────────────────────────────────
  const props = wb.addWorksheet("Properties", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: "&CPage &P of &N" },
  });

  const cols: Array<{ header: string; key: keyof HandoffPropertyRow | "city_state_zip"; width: number; isManual?: boolean }> = [
    { header: "Address", key: "address", width: 40 },
    { header: "City / State / Zip", key: "city_state_zip", width: 24 },
    { header: "Acquired", key: "acquisition_date", width: 12 },
    { header: "Acquisition $", key: "acquisition_price", width: 14 },
    { header: "Sold", key: "disposition_date", width: 12 },
    { header: "Disposition $", key: "disposition_price", width: 14 },
    { header: "Hold (mo)", key: "hold_months", width: 10 },
    { header: "Profit", key: "profit", width: 14 },
    { header: "Current AVM", key: "current_avm", width: 14 },
    { header: "Current LTV %", key: "ltv_current", width: 12 },
    { header: "Lender", key: "lender_name", width: 24 },
    { header: "Lender class", key: "lender_classification", width: 14 },
    { header: "Rehab spend $", key: "rehab_spend", width: 14, isManual: true },
    { header: "GC name", key: "gc_name", width: 24, isManual: true },
    { header: "GC license", key: "gc_license", width: 16, isManual: true },
    { header: "Narrative", key: "narrative", width: 50, isManual: true },
    { header: "Source", key: "source", width: 24 },
  ];
  props.columns = cols.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));

  const headerExcelRow = props.getRow(1);
  headerExcelRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerExcelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY } };
  headerExcelRow.alignment = { vertical: "middle", horizontal: "left" };

  for (const p of doc.properties) {
    const cityStateZip = [p.city, p.state, p.zip].filter(Boolean).join(", ");
    const row = props.addRow({
      address: p.address,
      city_state_zip: cityStateZip || "—",
      acquisition_date: fmtDate(p.acquisition_date),
      acquisition_price: p.acquisition_price ?? "—",
      disposition_date: p.disposition_date ? fmtDate(p.disposition_date) : "—",
      disposition_price: p.disposition_price ?? "—",
      hold_months: p.hold_months ?? "—",
      profit: p.profit ?? "—",
      current_avm: p.current_avm ?? "—",
      ltv_current: p.ltv_current != null ? `${p.ltv_current.toFixed(1)}%` : "—",
      lender_name: p.lender_name ?? "—",
      lender_classification: p.lender_classification ?? "—",
      rehab_spend: p.rehab_spend ?? "",
      gc_name: p.gc_name ?? "",
      gc_license: p.gc_license ?? "",
      narrative: p.narrative ?? "",
      source: p.source,
    });
    row.alignment = { vertical: "top", wrapText: true };

    // Highlight manual cells lightly so lender knows what they can fill
    for (const col of cols) {
      if (!col.isManual) continue;
      const idx = cols.indexOf(col) + 1;
      const cell = row.getCell(idx);
      if (!cell.value || cell.value === "—") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_FILL } };
      }
    }

    // Currency-format numeric price columns when filled
    const moneyKeys: Array<keyof HandoffPropertyRow> = [
      "acquisition_price", "disposition_price", "profit", "current_avm", "rehab_spend",
    ];
    for (const k of moneyKeys) {
      const colIdx = cols.findIndex((c) => c.key === k) + 1;
      if (!colIdx) continue;
      const cell = row.getCell(colIdx);
      if (typeof cell.value === "number") {
        cell.numFmt = "$#,##0";
      }
    }
  }

  props.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
