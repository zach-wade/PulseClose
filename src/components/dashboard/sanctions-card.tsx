import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Shield, AlertTriangle, CheckCircle2, ExternalLink, MinusCircle } from "lucide-react";
import type { SanctionsCheck } from "./shared-types";

export function SanctionsCard({ data }: { data: SanctionsCheck }) {
  const isClear = data.result === "clear";
  const isHit = data.result === "potential_match";
  const notRun = data.result === "not_run" || data.result === "pending";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Sanctions / PEP Screening
          <Badge
            variant={isHit ? "destructive" : isClear ? "default" : "secondary"}
            className="ml-auto"
          >
            {isHit && <AlertTriangle className="mr-1 h-3 w-3" />}
            {isClear && <CheckCircle2 className="mr-1 h-3 w-3" />}
            {notRun && <MinusCircle className="mr-1 h-3 w-3" />}
            {isHit
              ? `${data.match_count} POTENTIAL MATCH${data.match_count === 1 ? "" : "ES"}`
              : isClear
                ? "CLEAR"
                : "NOT RUN"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notRun && (
          <p className="text-sm text-muted-foreground">
            Sanctions screening did not run for this validation.
          </p>
        )}

        {(isClear || isHit) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Names Screened</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                <li>{data.borrower_name} <span className="text-muted-foreground">(borrower)</span></li>
                {data.entity_name && (
                  <li>{data.entity_name} <span className="text-muted-foreground">(entity)</span></li>
                )}
                {data.guarantor_name && data.guarantor_name !== data.borrower_name && (
                  <li>{data.guarantor_name} <span className="text-muted-foreground">(guarantor)</span></li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Lists Searched</p>
              <p className="mt-1 text-sm">{data.sources_searched.join(", ")}</p>
              <p className="text-xs text-muted-foreground mt-1">via {data.source}</p>
            </div>
          </div>
        )}

        {isHit && data.matches.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Potential Matches — Manual Review Required
            </p>
            {data.matches.map((m, i) => (
              <div key={i} className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{m.matched_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Searched as: {m.query_name}
                    </p>
                    {m.programs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.programs.map((p, j) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="secondary" className="text-xs">
                      {m.list_name}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round(m.score * 100)}% match
                    </p>
                  </div>
                </div>
                {m.source_url && (
                  <a
                    href={m.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-blue-500 hover:text-blue-700"
                  >
                    View source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground italic">
              Note: matches above the {Math.round(0.7 * 100)}% threshold are surfaced for review.
              Common names may produce false positives — verify identity before acting.
            </p>
          </div>
        )}

        {isClear && (
          <p className="text-sm text-muted-foreground">
            No matches found across {data.sources_searched.length} sanctions and PEP lists.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
