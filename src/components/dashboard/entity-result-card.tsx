import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, AlertTriangle, CheckCircle2, ExternalLink, Users, FileText, Info } from "lucide-react";
import { formatDate } from "./shared-types";
import type { EntityCheck } from "./shared-types";
import { extractCobaltDetails } from "@/lib/adapters/extract";

export { type EntityCheck };

// Strip whitespace+casing so "KIM AN TRUONG" matches "KIMAN TRUONG" — common
// when the SOS filing collapses or expands middle names differently than the
// legal name on file with the bank.
function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, "");
}

export function EntityResultCard({
  data,
  borrowerName,
  guarantorName,
}: {
  data: EntityCheck;
  borrowerName?: string;
  guarantorName?: string | null;
}) {
  const cobalt = extractCobaltDetails(data.raw_response);
  // Free public registries (CALICO / Socrata / live DOS / Sunbiz) confirm the
  // entity's existence + status but don't return officers, registered agent, or
  // filing history the way paid Cobalt does. When we resolved from one of them,
  // say so — otherwise the blank fields above read as a data gap, not a source
  // limitation (UX audit #7). `_source` is stamped by the SOS lookup layer.
  const entitySource = (data.raw_response as { _source?: string } | null)?._source ?? null;
  const FREE_SOURCE_LABELS: Record<string, string> = {
    ny_socrata: "NY DOS",
    ny_dos_live: "NY DOS",
    ca_calico: "CA SOS (CALICO)",
    co_socrata: "CO SOS",
    fl_sunbiz: "FL Sunbiz",
    tx_comptroller: "TX Comptroller",
    ct_socrata: "CT Business Registry",
    pa_socrata: "PA Dept. of State",
    or_socrata: "OR SOS",
    dc_arcgis: "DC DLCP",
    id_firststop: "ID SOSBiz",
    nd_firststop: "ND FirstStop",
  };
  const freeSourceLabel = entitySource ? (FREE_SOURCE_LABELS[entitySource] ?? null) : null;
  const hasError = data.raw_response?._error === true;
  const agentMatchesBorrower = namesMatch(data.registered_agent, borrowerName);
  const agentMatchesGuarantor =
    !!guarantorName && namesMatch(data.registered_agent, guarantorName);
  const officerMatchesBorrower = (cobalt?.officers ?? []).some((o) =>
    namesMatch(o.name, borrowerName),
  );
  const controlSignal =
    agentMatchesBorrower || officerMatchesBorrower
      ? `Borrower ${borrowerName} is ${agentMatchesBorrower ? "registered agent" : "an officer"} of the entity`
      : agentMatchesGuarantor
        ? `Guarantor ${guarantorName} is registered agent of the entity`
        : null;

  return (
    <Card id="entity-card" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4" />
          Entity Validation
          {data.source_url && (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 ml-auto"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {cobalt?.confidenceLevel != null && (
            <Badge
              variant={cobalt.confidenceLevel >= 0.8 ? "default" : "secondary"}
              className={`ml-auto text-xs ${cobalt.confidenceLevel < 0.8 ? "bg-amber-100 text-amber-800" : ""}`}
            >
              {Math.round(cobalt.confidenceLevel * 100)}% match
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Error state */}
          {hasError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Entity lookup failed. The data below may be incomplete. Manual verification recommended.
            </div>
          )}

          {/* Core entity info */}
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
              {hasError ? (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  CHECK FAILED
                </Badge>
              ) : (
                <Badge
                  // Active = status, so it must read GREEN, not the default blue
                  // (blue is for actions/identity only — design-system color rule).
                  variant={data.sos_status === "suspended" || data.sos_status === "dissolved" ? "destructive" : "secondary"}
                  className={
                    data.sos_status === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : undefined
                  }
                >
                  {data.sos_status.toUpperCase()}
                </Badge>
              )}
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

          {/* Free-source disclosure — explains the blank fields as a source
              limitation, not a missing entity. Lists only the fields THIS source
              actually left blank (CO returns an agent; CT/PA/OR don't; TX has
              agent+officers but no formation date) so the note never misdescribes. */}
          {(() => {
            if (!freeSourceLabel || hasError) return null;
            const missing: string[] = [];
            if (!cobalt || cobalt.officers.length === 0) missing.push("officers");
            if (!data.registered_agent) missing.push("registered agent");
            if (!data.last_filing_date) missing.push("filing history");
            if (missing.length === 0) return null;
            const list =
              missing.length === 1
                ? missing[0]
                : `${missing.slice(0, -1).join(", ")} or ${missing[missing.length - 1]}`;
            return (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Resolved from {freeSourceLabel} — a free public registry that confirms status
                  but doesn&apos;t return {list}. Blank fields above reflect the source, not a
                  missing entity.
                </span>
              </div>
            );
          })()}

          {/* Officers / Principals */}
          {cobalt && cobalt.officers.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Officers / Principals</p>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {cobalt.officers.map((o, i) => (
                  <p key={i} className="text-sm">
                    {o.name}
                    {o.title && (
                      <span className="text-muted-foreground ml-1">({o.title})</span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Recent filings */}
          {cobalt && cobalt.documents.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Recent Filings</p>
              </div>
              {cobalt.documents.slice(0, 3).map((d, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  {d.name}{d.date ? ` — ${d.date}` : ""}
                </p>
              ))}
            </div>
          )}

          {/* Positive signal: borrower/guarantor controls the entity */}
          {controlSignal && (
            <div className="flex items-start gap-2 text-sm text-emerald-700 pt-2 border-t">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {controlSignal}
            </div>
          )}

          {/* Flags */}
          {data.flags.length > 0 && (
            <div className="space-y-1 pt-2 border-t">
              {data.flags.map((flag, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-600"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
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
