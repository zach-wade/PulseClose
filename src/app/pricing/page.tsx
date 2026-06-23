import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";

// Public pricing page — the self-educate surface for a referred lender before
// signup. Authenticated users go to their in-app billing settings instead.
export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard/settings");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-foreground">Pulse</span>
            <span className="text-primary">Close</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button size="sm" render={<Link href="/signup" />}>
              Start free trial
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, per-seat pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Every plan includes all five validation pillars, the underwriting workbench, investor
          eligibility, and continuous monitoring. Plans differ only in monthly check volume.
        </p>
        <p className="mt-2 text-sm text-primary">Start with a 14-day free trial — up to 50 checks, no credit card.</p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <PlanCard
            name="Starter"
            price={299}
            checks="20 checks / month"
            blurb="Single-user lender getting off spreadsheets."
            features={["All five validation pillars", "Underwriting workbench", "Investor eligibility + handoff", "Continuous monitoring"]}
          />
          <PlanCard
            name="Professional"
            price={499}
            checks="50 checks / month"
            blurb="Small team running steady deal flow."
            features={["Everything in Starter", "Higher monthly volume", "Activity feed + comparison view", "Priority support"]}
            featured
          />
          <PlanCard
            name="Enterprise"
            price={799}
            checks="Unlimited checks"
            blurb="Mid-market lender at volume."
            features={["Everything in Professional", "Unlimited monthly checks", "Team roles + audit trail", "Onboarding assistance"]}
          />
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Questions about volume or a fund-level plan?{" "}
          <Link href="/signup" className="text-primary hover:underline">Start a trial</Link> and reach out from inside the app.
        </p>
      </section>
    </div>
  );
}

function PlanCard({
  name,
  price,
  checks,
  blurb,
  features,
  featured = false,
}: {
  name: string;
  price: number;
  checks: string;
  blurb: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-6 text-left ${featured ? "border-primary shadow-sm ring-1 ring-primary/20" : "border-border"}`}>
      {featured && (
        <span className="mb-3 inline-block rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-4">
        <span className="text-3xl font-bold">${price}</span>
        <span className="text-muted-foreground">/mo</span>
      </div>
      <p className="mt-1 text-sm font-medium text-primary">{checks}</p>
      <ul className="mt-5 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button className="mt-6 w-full" variant={featured ? "default" : "outline"} render={<Link href="/signup" />}>
        Start free trial
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
