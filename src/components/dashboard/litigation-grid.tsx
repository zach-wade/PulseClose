import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Scale, CheckCircle2, XCircle, ExternalLink, AlertTriangle } from "lucide-react";
import type { LitigationCheck } from "./shared-types";
import { extractCourtListenerDetails } from "@/lib/adapters/extract";

export { type LitigationCheck };

export function LitigationGrid({ data }: { data: LitigationCheck[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4" />
            Litigation Screening
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No litigation checks were run.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          Litigation Screening
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((lc) => {
            const cl = extractCourtListenerDetails(lc.raw_response);
            const isActive = cl?.isActive ?? false;
            const isFound = lc.result === "found";
            const isNotRun = lc.result === "not_run";

            return (
              <div
                key={lc.id}
                className={`rounded-md border p-3 ${
                  isNotRun
                    ? "border-amber-400/50 bg-amber-50/60"
                    : isFound && isActive
                      ? "border-destructive/40 bg-destructive/5"
                      : isFound
                        ? "border-amber-300/40 bg-amber-50/50"
                        : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium capitalize">
                    {lc.search_type.replace("_", " ")}
                  </p>
                  {isNotRun ? (
                    <Badge variant="secondary" className="gap-1 border-amber-400/60 text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      Did not complete
                    </Badge>
                  ) : lc.result === "clear" ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Clear
                    </Badge>
                  ) : isActive ? (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      Dismissed
                    </Badge>
                  )}
                </div>

                {/* Court name and jurisdiction */}
                {cl?.courtName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {cl.courtName}
                  </p>
                )}
                {!cl?.courtName && lc.source && (
                  <p className="text-xs text-muted-foreground mt-1">{lc.source}</p>
                )}

                {/* Case details */}
                {cl?.caseName && (
                  <p className="text-sm mt-2 font-medium">{cl.caseName}</p>
                )}
                {!cl?.caseName && lc.details && (
                  <p className="text-sm mt-2">{lc.details}</p>
                )}

                {/* Nature of suit / cause */}
                {cl?.natureOfSuit && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {cl.natureOfSuit}
                  </p>
                )}
                {cl?.cause && (
                  <p className="text-xs text-muted-foreground">
                    {cl.cause}
                  </p>
                )}

                {/* Dates */}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  {cl?.dateFiled && <span>Filed: {cl.dateFiled}</span>}
                  {cl?.dateTerminated && <span>Terminated: {cl.dateTerminated}</span>}
                </div>

                {/* Case number with link */}
                {lc.case_number && (
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-xs font-mono text-muted-foreground">
                      Case: {lc.case_number}
                    </p>
                    {cl?.absoluteUrl && (
                      <a
                        href={cl.absoluteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
