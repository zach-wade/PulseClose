import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Plan config — maps internal plan names to Stripe price IDs and limits.
//
// `internal` is reserved for non-billable accounts (founder/QA/demo orgs).
// It carries no Stripe price IDs, never goes through checkout, and bypasses
// both the monthly check cap and the free-tier 3-check pre-subscription
// gate (see api/validations/route.ts). Set an org to this plan via SQL —
// it's not exposed in /dashboard/settings.
export const PLANS = {
  internal: {
    name: "Internal",
    monthlyPriceId: null,
    annualPriceId: null,
    checkLimit: Number.POSITIVE_INFINITY,
    price: 0,
  },
  starter: {
    name: "Starter",
    monthlyPriceId: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    annualPriceId: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
    checkLimit: 20,
    price: 299,
  },
  professional: {
    name: "Professional",
    monthlyPriceId: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY!,
    annualPriceId: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL!,
    checkLimit: 50,
    price: 499,
  },
  enterprise: {
    name: "Enterprise",
    monthlyPriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
    annualPriceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL!,
    checkLimit: 999999, // unlimited
    price: 799,
  },
} as const;

export type PlanName = keyof typeof PLANS;

export function isUnlimitedPlan(plan: string): boolean {
  return plan === "internal";
}

// Resolve plan name from Stripe price ID
export function getPlanFromPriceId(priceId: string): PlanName {
  for (const [name, plan] of Object.entries(PLANS)) {
    if (plan.monthlyPriceId === priceId || plan.annualPriceId === priceId) {
      return name as PlanName;
    }
  }
  return "starter";
}

// Get check limit for a plan
export function getCheckLimit(plan: string): number {
  const p = PLANS[plan as PlanName];
  return p?.checkLimit ?? 20;
}
