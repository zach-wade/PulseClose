// Read-only — find the Test Co org so we know which row to flip to
// the internal plan tier.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function main() {
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, plan, checks_used_this_period, stripe_subscription_id, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(JSON.stringify(orgs, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
