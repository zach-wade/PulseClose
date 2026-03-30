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

export function LitigationGrid({ data, isStub = false }: { data: LitigationCheck[]; isStub?: boolean }) {
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
            PACER and state court integrations coming soon. Showing sample screening format.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((lc) => (
            <div
              key={lc.id}
              className={`rounded-md border p-3 ${
                lc.result === "found"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium capitalize">
                  {lc.search_type.replace("_", " ")}
                </p>
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
