import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HardHat, XCircle, Info } from "lucide-react";
import { formatDate } from "./shared-types";
import type { GCValidation } from "./shared-types";

export { type GCValidation };

export function GCResultCard({ data }: { data: GCValidation }) {
  const raw = (data.raw_response as Record<string, unknown>) ?? {};
  const isStub = !!raw._demo;
  const notAutomated = !!raw._not_automated;
  const reason = (raw._reason as string) ?? null;

  // For unautomated states, show a minimal card — fake "ACTIVE" badges
  // and "—" classification fields imply we did a check we didn't do.
  if (notAutomated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="h-4 w-4" />
            GC Validation
            <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800">
              NOT AUTOMATED
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-3 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              {reason ?? `License verification for ${data.license_state} is not yet automated.`}
              {" "}Manual verification recommended.
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Contractor (as entered)</p>
              <p className="font-medium">{data.gc_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">License # (as entered)</p>
              <p className="font-mono text-sm">
                {data.license_number ?? "—"} ({data.license_state})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          GC Validation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isStub && (
          <p className="text-xs text-muted-foreground mb-3">
            Showing simulated data — real adapter not configured.
          </p>
        )}
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Contractor</p>
              <p className="font-medium">{data.gc_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">License</p>
              <p className="font-mono text-sm">
                {data.license_number ?? "—"} ({data.license_state})
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge
                variant={
                  data.license_status === "active" ? "default" : "destructive"
                }
              >
                {data.license_status.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Classification</p>
              <p className="text-sm">{data.license_classification ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Expires</p>
              <p className="font-mono text-sm">
                {formatDate(data.expiration_date)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Insurance</p>
              <Badge
                variant={data.insurance_verified ? "default" : "secondary"}
              >
                {data.insurance_verified ? "Verified" : "Unverified"}
              </Badge>
            </div>
          </div>
          {data.disciplinary_actions.length > 0 && (
            <div className="space-y-1">
              {data.disciplinary_actions.map((action, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-red-600"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {action}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
