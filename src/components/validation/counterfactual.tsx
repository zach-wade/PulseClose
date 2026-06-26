// Counterfactual — "what clears this." The most-trusted explanation for
// novices (XAI research; UX-REDESIGN §11.2 principle 7). Renders nothing when
// there's nothing to clear (a verified verdict passes `null`).

import { CornerDownRight } from "lucide-react";

export function Counterfactual({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-[12.5px] text-muted-foreground">
      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>{text}</span>
    </div>
  );
}
