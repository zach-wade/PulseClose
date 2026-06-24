import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Shield, AlertTriangle, CheckCircle2, ExternalLink, MinusCircle } from "lucide-react";
import type { SanctionsCheck, SanctionsMatch } from "./shared-types";

// Pull officer/agent names that were screened by reading the matches'
// query_name field. Those names came from `additional_persons` in the
// adapter call (officers + registered agent from the SOS filing). We
// don't persist additional_persons explicitly yet; this is a best-effort
// surfacing so the displayed "Names Screened" set matches what was
// actually queried.
function extraScreenedNames(data: SanctionsCheck): string[] {
  const top = new Set(
    [data.borrower_name, data.entity_name, data.guarantor_name]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase()),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of data.matches ?? []) {
    const q = m.query_name?.trim();
    if (!q) continue;
    const key = q.toLowerCase();
    if (top.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

// The distinguishing facts the list publishes about the matched entry. These
// are what a reviewer uses to clear a common-name false positive — a DOB or
// nationality that obviously isn't the borrower's clears it in seconds.
function IdentifierFacts({
  identifiers,
}: {
  identifiers?: SanctionsMatch["identifiers"];
}) {
  if (!identifiers) return null;
  const rows: Array<[string, string[] | undefined]> = [
    ["DOB", identifiers.dob],
    ["Born in", identifiers.birth_place],
    ["Nationality", identifiers.nationality],
    ["Country", identifiers.countries],
    ["Role", identifiers.positions],
    ["Address", identifiers.addresses],
    ["ID", identifiers.id_numbers],
  ];
  const present = rows.filter(([, v]) => v && v.length > 0);
  if (present.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[84px_1fr] gap-x-2 gap-y-0.5 text-xs">
      {present.map(([label, vals]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono text-[11px] break-words">
            {(vals ?? []).slice(0, 4).join(" · ")}
            {(vals ?? []).length > 4 ? ` +${(vals ?? []).length - 4}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SanctionsCard({ data }: { data: SanctionsCheck }) {
  const isClear = data.result === "clear";
  const isHit = data.result === "potential_match";
  const notRun = data.result === "not_run" || data.result === "pending";

  // A match is only a confirmed concern when corroborated by a second
  // identifier. Otherwise every "potential match" is a name-only result to
  // review — a common name returns false positives. Drives badge tone + copy.
  const rollup = (data.raw_response?._disambiguation ?? {}) as {
    common_name_likely?: boolean;
    highest_confidence?: string;
  };
  const hasConfirmed =
    data.highest_confidence === "confirmed" ||
    rollup.highest_confidence === "confirmed" ||
    (data.matches ?? []).some((m) => m.confidence === "confirmed");
  const commonNameLikely = data.common_name_likely ?? rollup.common_name_likely ?? false;
  const reviewCount = (data.matches ?? []).filter((m) => m.review_required !== false).length || data.match_count;

  return (
    <Card id="sanctions-card" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Sanctions / PEP Screening
          <Badge
            variant={isHit && hasConfirmed ? "destructive" : isClear ? "default" : "secondary"}
            className={`ml-auto ${isHit && !hasConfirmed ? "border-amber-300 text-amber-700 bg-amber-50" : ""}`}
          >
            {isHit && <AlertTriangle className="mr-1 h-3 w-3" />}
            {isClear && <CheckCircle2 className="mr-1 h-3 w-3" />}
            {notRun && <MinusCircle className="mr-1 h-3 w-3" />}
            {isHit
              ? hasConfirmed
                ? `${reviewCount} CONFIRMED MATCH${reviewCount === 1 ? "" : "ES"}`
                : `${reviewCount} POSSIBLE — REVIEW`
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
                {/* Officers + registered agent from the SOS filing also get
                    screened — surface them so a reader doesn't see a match
                    against a name that wasn't disclosed as searched. We
                    derive these from the matches' query_name field since
                    additional_persons isn't persisted yet. */}
                {extraScreenedNames(data).map((name) => (
                  <li key={name}>
                    {name}{" "}
                    <span className="text-muted-foreground">(from entity filing)</span>
                  </li>
                ))}
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
              {hasConfirmed ? "Matches — Manual Review Required" : "Possible Matches — Review (Not Confirmed)"}
            </p>
            {commonNameLikely && (
              <p className="text-xs rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-900">
                <span className="font-medium">Name appears common.</span> These are name-only
                matches and are <span className="font-medium">not confirmed as this party</span>.
                Verify identity (DOB / address) before acting — a common name produces false positives.
              </p>
            )}
            {data.matches.map((m, i) => {
              const unconfirmed = m.confidence !== "confirmed";
              return (
              <div key={i} className={`rounded-md border p-3 ${unconfirmed ? "border-amber-200 bg-amber-50/40" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{m.matched_name}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase ${unconfirmed ? "border-amber-300 text-amber-700 bg-amber-50/60" : "border-destructive/40 text-destructive"}`}
                      >
                        {m.confidence === "confirmed" ? "Confirmed" : m.confidence === "probable" ? "Probable — review" : "Possible — review"}
                      </Badge>
                    </div>
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
                    <IdentifierFacts identifiers={m.identifiers} />
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="secondary" className="text-xs">
                      {m.list_name}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round(m.score * 100)}% name similarity
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
              );
            })}
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
