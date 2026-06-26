"use client";

// Inline glossary tooltip for CRE / bridge-lending jargon (UX-REDESIGN-PLAN §10
// #5). Wraps a term in a dotted-underline hover that defines it in place, so a
// non-expert can self-serve instead of bouncing on LTARV / DSCR / debt yield.
// Definitions live in one GLOSSARY so they stay consistent everywhere.
//
// Usage:  <Term>LTV</Term>            (looks the label up in GLOSSARY)
//         <Term term="DSCR">DSCR in-place</Term>   (display text ≠ glossary key)
//         <Term def="custom…">X</Term> (one-off definition)
// If no definition is found, it renders the children unchanged (safe no-op).

import type { ReactNode } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export const GLOSSARY: Record<string, string> = {
  LTV: "Loan-to-Value — loan ÷ the property's as-is value.",
  LTC: "Loan-to-Cost — loan ÷ total project cost (purchase + rehab + closing).",
  LTARV: "Loan-to-After-Repair-Value — loan ÷ the stabilized / renovated value.",
  DSCR: "Debt-Service Coverage Ratio — NOI ÷ annual debt service. Above 1.0x means income covers the loan payment.",
  "debt yield": "Debt yield — NOI ÷ loan amount. A leverage-independent read on how hard the income works.",
  NOI: "Net Operating Income — rental income minus operating expenses, before debt service.",
  "going-in cap": "Going-in cap rate — in-place NOI ÷ as-is value; prices the property as it is today.",
  "exit cap": "Exit cap rate — stabilized NOI ÷ stabilized value; prices the property after the business plan.",
  "binding constraint": "The single test (LTV / LTC / LTARV / DSCR / debt-yield) that permits the smallest loan — it sets the deal size.",
  "best execution": "The investor whose caps + pricing give the borrower the largest / cheapest loan for this deal.",
  mandate: "A capital provider's published diligence + underwriting standard; a borrower run is stamped meets / conditional / fails against it.",
  PEP: "Politically Exposed Person — screened alongside sanctions for elevated risk.",
  "interest reserve": "Loan proceeds held back to cover interest during rehab / lease-up, before the property covers its own debt service.",
  takeout: "The permanent loan that refinances (takes out) the bridge loan at the end of the term.",
  tier: "The deterministic risk tier (LOW / MEDIUM / HIGH) the engine assigns. The AI narrates it — it never sets it.",
  "yield-on-cost": "Stabilized NOI ÷ total project cost — the return the finished deal throws off on every dollar spent.",
  "equity multiple": "Total equity returned ÷ equity invested over the deal's life.",
};

function lookup(key: string): string | undefined {
  return GLOSSARY[key] ?? GLOSSARY[key.toLowerCase()] ?? GLOSSARY[key.toUpperCase()];
}

export function Term({ children, term, def }: { children?: ReactNode; term?: string; def?: string }) {
  const key = term ?? (typeof children === "string" ? children : "");
  const definition = def ?? (key ? lookup(key) : undefined);
  if (!definition) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
            {children ?? term}
          </span>
        }
      />
      <TooltipContent side="top" className="max-w-xs text-left">
        {definition}
      </TooltipContent>
    </Tooltip>
  );
}
