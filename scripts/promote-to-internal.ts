// Flip an org's plan to `internal` (unlimited, non-billable). One-shot.
//
// Usage:
//   set -a; source .env.local; set +a;
//   ORG_ID=<uuid> npx tsx scripts/promote-to-internal.ts
//
// Without ORG_ID, defaults to the Test Co org id from the prod database
// (9e580f59-b01d-4cbd-a950-76dd4f32ee6c). Idempotent.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const DEFAULT_TEST_CO_ID = "9e580f59-b01d-4cbd-a950-76dd4f32ee6c";
const orgId = process.env.ORG_ID ?? DEFAULT_TEST_CO_ID;

async function main() {
  const { data: before } = await supabase
    .from("organizations")
    .select("id, name, plan, checks_used_this_period")
    .eq("id", orgId)
    .single();
  if (!before) {
    console.error(`Org ${orgId} not found`);
    process.exit(1);
  }
  console.log("Before:", before);

  // Reset checks_used_this_period to 0 so the dashboard usage card looks
  // clean post-flip. The check itself is bypassed by isUnlimitedPlan().
  const { error } = await supabase
    .from("organizations")
    .update({ plan: "internal", checks_used_this_period: 0 })
    .eq("id", orgId);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const { data: after } = await supabase
    .from("organizations")
    .select("id, name, plan, checks_used_this_period")
    .eq("id", orgId)
    .single();
  console.log("After:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
