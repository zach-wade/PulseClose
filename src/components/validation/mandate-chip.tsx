// Mandate standing chip — pass / conditional / fail rendered through the SAME
// status tokens (color + icon + shape) as the verdict hero / list / portfolio,
// so the Mandate Console and the detail-page mandate card read identically to
// the rest of the app (UX-POLISH-BACKLOG #5).
//
// A mandate result maps onto the three verdict states:
//   pass        → verified    (Meets standard)
//   conditional → needs_review (Meets with conditions)
//   fail        → flagged     (Does not meet)

import { VERDICT_TOKENS } from "./status";
import type { VerdictState } from "@/lib/validation/verdict";
import { cn } from "@/lib/utils";

export type MandateResult = "pass" | "conditional" | "fail";

const RESULT_STATE: Record<MandateResult, VerdictState> = {
  pass: "verified",
  conditional: "needs_review",
  fail: "flagged",
};

const LABELS: Record<MandateResult, { short: string; full: string }> = {
  pass: { short: "Meets", full: "Meets standard" },
  conditional: { short: "Conditional", full: "Meets w/ conditions" },
  fail: { short: "Fails", full: "Does not meet" },
};

export function MandateChip({
  result,
  variant = "full",
  className,
}: {
  result: MandateResult;
  variant?: "short" | "full";
  className?: string;
}) {
  const token = VERDICT_TOKENS[RESULT_STATE[result]];
  const Icon = token.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        token.bg,
        token.border,
        token.fg,
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {LABELS[result][variant]}
    </span>
  );
}
