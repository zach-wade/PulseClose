import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { stripe, PLANS, type PlanName } from "@/lib/stripe/server";
import { captureServer } from "@/lib/analytics/server";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { plan, interval = "monthly" } = body as {
    plan: PlanName;
    interval?: "monthly" | "annual";
  };

  const planConfig = PLANS[plan];
  if (!planConfig) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  // `internal` plan has no Stripe price IDs — set via SQL only, never via
  // checkout. Reject early so the type narrowing below isn't ambiguous.
  if (!planConfig.monthlyPriceId || !planConfig.annualPriceId) {
    return NextResponse.json(
      { error: "Plan is not purchasable via checkout" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Get org to check for existing Stripe customer
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, stripe_customer_id")
    .eq("id", profile.org_id)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 400 });
  }

  // Create or reuse Stripe customer
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: org.name,
      metadata: { org_id: org.id, user_id: profile.id },
    });
    customerId = customer.id;

    await supabase
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id);
  }

  const priceId =
    interval === "annual" ? planConfig.annualPriceId : planConfig.monthlyPriceId;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.pulseclose.com";

  void captureServer(profile.id, "checkout_started", { plan, interval, org_id: org.id });

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?upgraded=true`,
    cancel_url: `${appUrl}/dashboard/settings`,
    metadata: { org_id: org.id },
    subscription_data: {
      metadata: { org_id: org.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
