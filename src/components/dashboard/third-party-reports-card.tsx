"use client";

// Third-party report tracking — one of the two subproducts Damon named himself
// ("the 3rd party report tracking… as separate specific products"). The non-
// appraisal reports (title, flood, environmental, feasibility…) are email-only
// today and fall through the cracks; this tracks needed → ordered → received →
// cleared with dates, the way their appraisal dashboard already works.
//
// PREVIEW: the standard report set + a stage pipeline is real UI; live ordering
// status is sample until the report-tracking backend ships. Labeled honestly
// (guardrail: never present scaffold data as a verified result).

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileStack } from "lucide-react";

type Stage = "needed" | "ordered" | "received" | "cleared";

const STAGE_META: Record<Stage, { label: string; cls: string }> = {
  needed: { label: "Needed", cls: "bg-muted text-muted-foreground" },
  ordered: { label: "Ordered", cls: "bg-info/15 text-info" },
  received: { label: "Received", cls: "bg-warning/15 text-warning-foreground" },
  cleared: { label: "Cleared", cls: "bg-success/15 text-success" },
};

// The standard non-appraisal report set for a bridge / value-add loan.
const SAMPLE_REPORTS: { type: string; stage: Stage; vendor: string | null; date: string | null }[] = [
  { type: "Title / preliminary report", stage: "cleared", vendor: "First American", date: "Jun 12" },
  { type: "Flood certification", stage: "cleared", vendor: "CoreLogic", date: "Jun 12" },
  { type: "Property insurance (binder)", stage: "received", vendor: "—", date: "Jun 20" },
  { type: "Environmental (Phase I)", stage: "ordered", vendor: "EBI Consulting", date: "Jun 22" },
  { type: "Construction feasibility", stage: "needed", vendor: null, date: null },
];

export function ThirdPartyReportsCard() {
  const cleared = SAMPLE_REPORTS.filter((r) => r.stage === "cleared").length;
  const pct = Math.round((cleared / SAMPLE_REPORTS.length) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileStack className="h-4 w-4 text-info" /> Third-party reports
          </CardTitle>
          <Badge variant="outline">Preview</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          The non-appraisal reports that live in email today — tracked needed → ordered → received → cleared.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
            <div className="h-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{cleared}/{SAMPLE_REPORTS.length} cleared</span>
        </div>
        <div className="space-y-1.5">
          {SAMPLE_REPORTS.map((r) => (
            <div key={r.type} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{r.type}</span>
                {r.vendor && <span className="text-xs text-muted-foreground ml-2">{r.vendor}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.date && <span className="text-xs text-muted-foreground">{r.date}</span>}
                <Badge className={`text-[10px] ${STAGE_META[r.stage].cls}`}>{STAGE_META[r.stage].label}</Badge>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sample pipeline. Live ordering + status sync ships with the report-tracking backend — a standalone subproduct.
        </p>
      </CardContent>
    </Card>
  );
}
