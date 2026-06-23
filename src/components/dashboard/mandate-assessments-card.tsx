"use client";

// Capital-provider mandate stamps on the validation detail page (Item 4).
// Shows which fund standards this validation meets (auto-assessed on
// completion; re-assessable on demand). Renders nothing when the org has no
// mandates configured.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface Assessment {
  id: string;
  mandate_id: string;
  investor_id: string;
  mandate_name: string | null;
  investor_name: string | null;
  result: "pass" | "conditional" | "fail";
  failures: { gate: string; message: string }[];
  assessed_at: string;
}

function Verdict({ result }: { result: Assessment["result"] }) {
  if (result === "pass") return <Badge className="bg-emerald-500/90 text-white">Meets standard</Badge>;
  if (result === "conditional") return <Badge className="bg-amber-500/90 text-white">Meets w/ conditions</Badge>;
  return <Badge variant="destructive">Does not meet</Badge>;
}

export function MandateAssessmentsCard({ validationId }: { validationId: string }) {
  const [rows, setRows] = useState<Assessment[] | null>(null);
  const [reassessing, setReassessing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/validations/${validationId}/mandate-assessments`);
    setRows(res.ok ? (await res.json()).assessments : []);
  }, [validationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reassess() {
    setReassessing(true);
    try {
      const res = await fetch(`/api/validations/${validationId}/mandate-assessments`, { method: "POST" });
      if (res.ok) setRows((await res.json()).assessments);
    } finally {
      setReassessing(false);
    }
  }

  if (!rows || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-info" /> Capital-provider mandates
          </span>
          <Button size="sm" variant="outline" onClick={reassess} disabled={reassessing}>
            {reassessing ? "Re-assessing…" : "Re-assess"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((a) => (
          <div
            key={a.id}
            className={`rounded-md border p-3 ${
              a.result === "pass"
                ? "border-emerald-200 bg-emerald-50/30"
                : a.result === "conditional"
                  ? "border-amber-200 bg-amber-50/30"
                  : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {a.mandate_name ?? "Mandate"}
                  {a.investor_name && <span className="text-muted-foreground font-normal"> · {a.investor_name}</span>}
                </p>
                {a.failures.length > 0 && (
                  <ul className="mt-1 text-xs space-y-0.5 list-disc list-inside text-destructive">
                    {a.failures.map((f, i) => (
                      <li key={i}>{f.message}</li>
                    ))}
                  </ul>
                )}
              </div>
              <Verdict result={a.result} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
