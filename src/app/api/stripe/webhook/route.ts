import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, getPlanFromPriceId } from "@/lib/stripe/server";
import { captureServer } from "@/lib/analytics/server";

// In-memory idempotency store for processed webhook events.
// Prevents double-processing if Stripe retries delivery.
// TTL: 24 hours. For multi-instance deployments, move to Redis/Supabase.
const processedEvents = new Map<string, number>();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000;

function cleanupProcessedEvents() {
  const cutoff = Date.now() - IDEMPOTENCY_TTL;
  for (const [id, timestamp] of processedEvents) {
    if (timestamp < cutoff) processedEvents.delete(id);
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check — skip already-processed events
  cleanupProcessedEvents();
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processedEvents.set(event.id, Date.now());

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as unknown as Record<string, unknown>;
      const orgId = (session.metadata as Record<string, string>)?.org_id;
      const subscriptionId = session.subscription as string;

      if (orgId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as Record<string, unknown>;
        const items = subscription.items as { data: { price: { id: string } }[] };
        const priceId = items.data[0]?.price.id;
        const plan = getPlanFromPriceId(priceId ?? "");

        await supabase
          .from("organizations")
          .update({
            plan,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            billing_period_start: new Date((subscription.current_period_start as number) * 1000).toISOString(),
            billing_period_end: new Date((subscription.current_period_end as number) * 1000).toISOString(),
            checks_used_this_period: 0,
          })
          .eq("id", orgId);

        void captureServer(orgId, "subscription_activated", { plan, price_id: priceId });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as unknown as Record<string, unknown>;
      const orgId = (subscription.metadata as Record<string, string>)?.org_id;
      const items = subscription.items as { data: { price: { id: string } }[] };
      const priceId = items.data[0]?.price.id;
      const plan = getPlanFromPriceId(priceId ?? "");

      if (orgId) {
        await supabase
          .from("organizations")
          .update({
            plan,
            stripe_price_id: priceId,
            billing_period_start: new Date((subscription.current_period_start as number) * 1000).toISOString(),
            billing_period_end: new Date((subscription.current_period_end as number) * 1000).toISOString(),
          })
          .eq("id", orgId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as unknown as Record<string, unknown>;
      const orgId = (subscription.metadata as Record<string, string>)?.org_id;

      if (orgId) {
        await supabase
          .from("organizations")
          .update({
            plan: "starter",
            stripe_subscription_id: null,
            stripe_price_id: null,
            billing_period_start: null,
            billing_period_end: null,
          })
          .eq("id", orgId);
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subscriptionId = invoice.subscription as string;

      if (subscriptionId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (org) {
          await supabase
            .from("organizations")
            .update({ checks_used_this_period: 0 })
            .eq("id", org.id);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
