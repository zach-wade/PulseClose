import { Button } from "@/components/ui/button";
import {
  Search,
  Building2,
  HardHat,
  Scale,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Search,
    title: "Entity Validation",
    description:
      "SOS lookup across all 50 states. Check entity status, formation dates, registered agents, and flag suspended or dissolved entities.",
  },
  {
    icon: Building2,
    title: "Track Record Verification",
    description:
      "Property transaction history, project outcomes, experience tier classification. Know if they've actually done the deals they claim.",
  },
  {
    icon: HardHat,
    title: "GC Credential Checks",
    description:
      "Contractor license validation, permit history, insurance verification. Flag related-party relationships and unlicensed GCs.",
  },
  {
    icon: Scale,
    title: "Litigation Screening",
    description:
      "PACER bankruptcy search, county foreclosure records, lis pendens, and state court litigation. One search, full picture.",
  },
];

const painPoints = [
  "Searching 50 different state SOS websites manually",
  "Relying on borrower-provided track record lists",
  "Missing suspended entities or prior defaults",
  "No standard process for GC permit validation",
  "Spending 30+ minutes per borrower on checks that should take seconds",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-foreground">Pulse</span>
            <span className="text-primary">Close</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button render={<Link href="/signup" />}>
              Get started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground max-w-3xl mx-auto leading-tight">
          Borrower validation for bridge lenders.{" "}
          <span className="text-primary">Automated.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Entity checks, track record verification, GC credentials, and
          litigation screening — in minutes, not hours. The highest-risk gap in
          bridge lending, finally closed.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button size="lg" render={<Link href="/signup" />}>
            Start validating
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      </section>

      {/* Pain points */}
      <section className="bg-card border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold tracking-tight text-center mb-8">
            If this sounds familiar, you need PulseClose
          </h2>
          <div className="max-w-2xl mx-auto space-y-3">
            {painPoints.map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <p className="text-muted-foreground">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-12">
          One platform. Every check.
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-border bg-card p-6"
            >
              <feature.icon className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0F172A] text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Stop guessing. Start validating.
          </h2>
          <p className="mt-3 text-slate-300 max-w-lg mx-auto">
            Bridge lenders use PulseClose to validate borrowers in minutes — not
            hours. $35-50 per full validation package.
          </p>
          <Button size="lg" className="mt-8" render={<Link href="/signup" />}>
            Get started free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Pulse</span>
            <span className="font-semibold text-primary">Close</span>
            <span className="ml-2">
              Built for originate-to-sell bridge lenders.
            </span>
          </div>
          <div>&copy; {new Date().getFullYear()} PulseClose</div>
        </div>
      </footer>
    </div>
  );
}
