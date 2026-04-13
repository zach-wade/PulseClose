import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Scale, CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import type { LitigationCheck } from "./shared-types";

export { type LitigationCheck };

function isCountyLevel(searchType: string): boolean {
  return searchType === "foreclosure" || searchType === "lis_pendens";
}

function isNotAutomated(source: string): boolean {
  return source.includes("not yet automated") || source.includes("[DEMO]");
}

export function LitigationGrid({ data, isStub = false }: { data: LitigationCheck[]; isStub?: boolean }) {
  const hasCountyPending = data.some((lc) => isCountyLevel(lc.search_type) && isNotAutomated(lc.source));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          Litigation Screening
          {isStub && (
            <Badge variant="secondary" className="ml-2 gap-1 text-xs">
              <FlaskConical className="h-3 w-3" />
              Beta
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isStub && (
          <p className="text-xs text-muted-foreground mb-3">
            Showing sample screening format. Live data sources noted per check.
          </p>
        )}
        {hasCountyPending && !isStub && (
          <p className="text-xs text-muted-foreground mb-3">
            Foreclosure and lis pendens are county-level records. Automated search coming soon — manual review recommended.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((lc) => {
            const pending = isNotAutomated(lc.source);
            return (
              <div
                key={lc.id}
                className={`rounded-md border p-3 ${
                  lc.result === "found"
                    ? "border-destructive/30 bg-destructive/5"
                    : pending
                      ? "border-dashed border-muted-foreground/30"
                      : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium capitalize">
                      {lc.search_type.replace("_", " ")}
                    </p>
                    {pending && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Manual
                      </Badge>
                    )}
                  </div>
                  {lc.result === "clear" ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Clear
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Found
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{lc.source}</p>
                {lc.details && <p className="text-sm mt-2">{lc.details}</p>}
                {lc.case_number && (
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    Case: {lc.case_number}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
