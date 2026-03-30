import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, AlertTriangle } from "lucide-react";
import { formatDate } from "./shared-types";
import type { EntityCheck } from "./shared-types";

export { type EntityCheck };

export function EntityResultCard({ data }: { data: EntityCheck }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4" />
          Entity Validation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Entity</p>
              <p className="font-medium">{data.entity_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">State / Type</p>
              <p className="font-medium">
                {data.state} — {data.entity_type ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">SOS Status</p>
              <Badge
                variant={
                  data.sos_status === "active"
                    ? "default"
                    : data.sos_status === "suspended"
                      ? "destructive"
                      : "secondary"
                }
              >
                {data.sos_status.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Formed</p>
              <p className="font-mono text-sm">
                {formatDate(data.formation_date)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Filing</p>
              <p className="font-mono text-sm">
                {formatDate(data.last_filing_date)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registered Agent</p>
              <p className="text-sm">{data.registered_agent ?? "—"}</p>
            </div>
          </div>
          {data.flags.length > 0 && (
            <div className="space-y-1">
              {data.flags.map((flag, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-amber-600"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {flag}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
