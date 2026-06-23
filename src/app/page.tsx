import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Scale,
  Gavel,
  Landmark,
  HardHat,
  Ruler,
  Users,
  Activity,
  ArrowRight,
} from "lucide-react";

// app.pulseclose.com is the product. The root is now a public landing page so
// referred lenders (capital-partner / conference / Damon network) can land,
// self-educate, and start a free trial without a sales call. Authenticated
// users skip straight to the dashboard.
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-foreground">Pulse</span>
            <span className="text-primary">Close</span>
          </span>
          <nav className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button size="sm" render={<Link href="/signup" />}>
              Start free trial
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="text-sm font-medium text-primary">Borrower validation &amp; underwriting for bridge lenders</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Validate the borrower, size the loan, and judge the deal — in one place.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          PulseClose runs entity, track-record, litigation, and sanctions checks in parallel,
          then sizes the loan and surfaces the deal-killers — so a two-hour file review becomes a
          five-minute decision.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/signup" />}>
            Start free trial
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/pricing" />}>
            See pricing
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          14-day free trial · no credit card required
        </p>
      </section>

      {/* Capabilities */}
      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">Everything a credit committee needs, deterministic by default</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
            Every score is computed from source data you can drill into. AI narrates — it never
            picks the tier or sets the loan amount.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={ShieldCheck} title="Entity validation" body="Secretary-of-State lookup across 50 states. Officers, ownership, and registered agent extracted." />
            <Feature icon={Landmark} title="Track record" body="Deed-chain verification of the borrower's flip history against what they submitted." />
            <Feature icon={Gavel} title="Litigation screening" body="Federal civil + bankruptcy cases materialized into structured, drill-down cards." />
            <Feature icon={Scale} title="Sanctions / PEP" body="OpenSanctions with OFAC SDN fallback. Officers and agents screened, not just the entity." />
            <Feature icon={Ruler} title="Underwriting Workbench" body="Sizes the loan as the minimum across LTV / LTC / LTARV / DSCR / debt-yield and names the binding constraint." />
            <Feature icon={Users} title="Investor eligibility" body="Match a deal across all your capital sources, best-execution sorted, with counter-offers." />
            <Feature icon={HardHat} title="GC validation" body="CSLB license verification for California contractors, with more states coming." />
            <Feature icon={Activity} title="Continuous monitoring" body="Re-runs entity, litigation, and sanctions on a cadence and emails you what changed." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">From intake to investor handoff</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          <Step n={1} title="Drop in the deal" body="Paste the borrower and entity, or upload their track-record sheet — the form pre-fills in seconds." />
          <Step n={2} title="Run the validation" body="Five pillars run in parallel and score deterministically. Override anything and the tier rebuilds atomically." />
          <Step n={3} title="Size, judge, hand off" body="Size the loan, get the AI underwriting read, and export a capital-partner-ready Excel + PDF." />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-primary/5">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Run your next deal through it free.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            14 days, up to 50 checks, no credit card. See a real validation on a real borrower before
            you decide anything.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button size="lg" render={<Link href="/signup" />}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/pricing" />}>
              See pricing
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
          <span className="text-sm font-semibold">
            <span className="text-foreground">Pulse</span>
            <span className="text-primary">Close</span>
          </span>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Start free trial</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <div className="mb-3 inline-flex rounded-md bg-primary/10 p-2">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
