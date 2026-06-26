// Validation coverage at a glance — which states we can validate Secretary-of-
// State (entity) and General-Contractor licenses for right now, by what source.
// Server component: reads the live env (CALICO/Cobalt keys) + the same coverage
// constants the adapters use, so it never drifts from what actually works.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, MinusCircle, Globe } from "lucide-react";
import {
  sosCoverage,
  SOS_FALLBACK,
  gcCoverageRows,
  GC_FALLBACK,
  fullyCoveredStates,
  NATIONWIDE_PILLARS,
  type SosRow,
  type GcRow,
} from "@/lib/coverage/map";

export const dynamic = "force-dynamic"; // env-dependent (CALICO key)

function Dot({ live, pending }: { live: boolean; pending?: boolean }) {
  if (live) return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (pending) return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <MinusCircle className="h-4 w-4 text-slate-400" />;
}

function Row({ state, source, cost, status, note }: { state: string; source: string; cost?: string; status: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="w-10 shrink-0 font-mono text-sm font-semibold">{state}</span>
      <span className="flex-1 text-sm">{source}{note && <span className="text-muted-foreground"> — {note}</span>}</span>
      {cost && <span className="w-32 shrink-0 text-right text-xs text-muted-foreground">{cost}</span>}
      <span className="w-6 shrink-0">{status}</span>
    </div>
  );
}

export default function CoveragePage() {
  const calicoKeySet = Boolean(process.env.CALICO_API_KEY);
  const sos: SosRow[] = sosCoverage({ calicoKeySet });
  const gc: GcRow[] = gcCoverageRows();
  const fully = fullyCoveredStates({ calicoKeySet });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Validation coverage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Where we can validate entity (Secretary of State) and GC license right now, and by what source.
          Litigation, sanctions, and track record are nationwide. This page reads the live keys + adapters — it&apos;s
          accurate as of page load.
        </p>
      </div>

      {/* At a glance — where both SOS + GC validate, free, today */}
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="p-4">
          <p className="text-sm font-medium">Fully covered (entity + GC, free, today)</p>
          {fully.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{fully.join(", ")}</span> — both the entity
              lookup and GC license resolve from a free source. The cleanest place to run a full end-to-end.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No state currently has both free-now entity + GC. CA joins the moment the CALICO key is set.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Secretary of State */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entity — Secretary of State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {sos.map((r) => (
              <Row
                key={r.state}
                state={r.state}
                source={r.source}
                cost={r.cost}
                note={r.note}
                status={<Dot live={r.live} pending={!r.live && r.tier === "free-live"} />}
              />
            ))}
            <Row
              state="·"
              source={SOS_FALLBACK.source}
              cost={SOS_FALLBACK.cost}
              note={SOS_FALLBACK.note}
              status={<Dot live={false} pending />}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Free sources de-rent Cobalt: CALICO (CA, live API), Socrata (CO/NY, live), FL Sunbiz (bulk). Everything
            else falls through to Cobalt — paid, and the trial quota is currently exhausted in prod.
          </p>
        </CardContent>
      </Card>

      {/* General Contractor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GC license</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {gc.map((r) => (
              <Row
                key={r.state}
                state={r.state}
                source={r.source}
                note={r.note}
                status={<Dot live={r.live} />}
              />
            ))}
            <Row state="·" source={GC_FALLBACK.source} note={GC_FALLBACK.note} status={<Dot live={false} />} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            CA = CSLB scrape; WA/OR/FL/VA = official bulk ingest (~400k licenses). TX/NY/PA have no statewide GC
            license (municipal only) — structurally unverifiable at the state level. Others are manual until bulk
            ingest is added (prioritized by miss telemetry).
          </p>
        </CardContent>
      </Card>

      {/* Nationwide pillars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-info" /> Nationwide (not state-gated)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {NATIONWIDE_PILLARS.map((p) => (
              <Row key={p.pillar} state={p.pillar.slice(0, 4)} source={`${p.pillar} · ${p.source}`} note={p.note} status={<Dot live />} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
