"use client";

// Mandate Console — the fund-side view of the wedge: the standards you publish
// and how every borrower run measures against them (pass / conditional / fail).
// For a capital provider this is the home screen — "across the deals run against
// my standard, which clear and which fail, and why." Real cross-ORIGINATOR
// aggregation ships with the Fund tenant; the cross-originator panel here is an
// explicitly-labeled preview (gated on the rep-and-warranty question).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ArrowLeft, Lock } from "lucide-react";
import { MandateChip, type MandateResult } from "@/components/validation/mandate-chip";

interface MandateRollup {
  id: string;
  name: string;
  enabled: boolean;
  investor_name: string | null;
  total: number;
  pass: number;
  conditional: number;
  fail: number;
  pass_rate: number | null;
  recent: { validation_id: string | null; borrower_name: string | null; result: string; failure_count: number }[];
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export default function MandateConsolePage() {
  const [mandates, setMandates] = useState<MandateRollup[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/mandates/console");
      if (res.ok) setMandates((await res.json()).mandates ?? []);
      else setMandates([]);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate/investors" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-info" /> Mandate Console
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            The standard you publish — and how every borrower measures against it. The capital-provider&apos;s view of the verdict.
          </p>
        </div>
      </div>

      {mandates === null ? (
        <Skeleton className="h-64 w-full" />
      ) : mandates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No mandates published yet</p>
            <p className="text-sm text-muted-foreground">
              A mandate is a capital provider&apos;s standard — the gates a borrower must clear. Author one against an investor in{" "}
              <Link href="/dashboard/evaluate/investors" className="underline">Capital → Investors</Link>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mandates.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{m.name}</CardTitle>
                    {m.investor_name && <p className="text-xs text-muted-foreground mt-0.5">{m.investor_name}</p>}
                  </div>
                  <Badge variant={m.enabled ? "default" : "outline"}>{m.enabled ? "active" : "paused"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-5 gap-2 rounded-lg border border-border bg-muted/20 py-3">
                  <Stat label="assessed" value={m.total} />
                  <Stat label="meet" value={m.pass} tone="text-success" />
                  <Stat label="conditional" value={m.conditional} tone="text-warning" />
                  <Stat label="fail" value={m.fail} tone="text-destructive" />
                  <Stat label="pass rate" value={m.pass_rate != null ? `${Math.round(m.pass_rate * 100)}%` : "—"} />
                </div>
                {m.recent.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Recent verdicts</p>
                    {m.recent.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm rounded-md border border-border px-3 py-1.5">
                        <Link
                          href={r.validation_id ? `/dashboard/validations/${r.validation_id}` : "#"}
                          className="font-medium hover:underline truncate"
                        >
                          {r.borrower_name ?? "Borrower"}
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.failure_count > 0 && <span className="text-xs text-muted-foreground">{r.failure_count} gate{r.failure_count === 1 ? "" : "s"}</span>}
                          <MandateChip result={r.result as MandateResult} variant="short" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Preview — the gated Fund-tenant capability, labeled honestly. */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4" /> Cross-originator program view
                <Badge variant="outline" className="ml-1">Preview</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                With the Fund tenant, a capital provider sees these verdicts across <span className="font-medium text-foreground">every originator</span> in
                its program — throughput, exception rate, and which originators deliver in-box — sharing the <span className="font-medium text-foreground">verdict only</span>, never the borrower&apos;s raw diligence record.
              </p>
              <div className="grid grid-cols-3 gap-2 opacity-70">
                {[
                  { o: "Insignia Capital", meet: "8/10", rate: "80%" },
                  { o: "Harbor Lending", meet: "5/9", rate: "56%" },
                  { o: "Cedar Bridge", meet: "11/12", rate: "92%" },
                ].map((p) => (
                  <div key={p.o} className="rounded-md border border-dashed border-border px-3 py-2">
                    <p className="text-xs font-medium text-foreground">{p.o}</p>
                    <p className="text-lg font-bold text-foreground">{p.meet}</p>
                    <p className="text-[11px]">meet standard · {p.rate}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs">
                Sample data. Cross-originator sharing ships with the Fund tenant — gated on whether a fund grants rep-and-warranty relief on the verdict (the load-bearing customer question).
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
