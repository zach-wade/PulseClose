// Vercel Cron entry — retries pending webhook_deliveries whose backoff
// window has elapsed. Auth via the CRON_SECRET bearer token Vercel injects
// (same pattern as /api/cron/monitor). Schedule in vercel.json.
//
// Delivery rows are created 'pending' before the first attempt, so even a
// first attempt cut short by the function returning is recovered here.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryPendingDeliveries } from "@/lib/webhooks/deliver";

export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = createAdminClient();
  const result = await retryPendingDeliveries(supabase, 100);
  return NextResponse.json({ ok: true, ...result });
}
