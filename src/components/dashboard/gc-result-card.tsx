import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HardHat, XCircle, FlaskConical } from "lucide-react";
import { formatDate } from "./shared-types";
import type { GCValidation } from "./shared-types";

export { type GCValidation };

export function GCResultCard({ data, isStub = false }: { data: GCValidation; isStub?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          GC Validation
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
            State licensing board integrations coming soon. Showing sample validation format.
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
