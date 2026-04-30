import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function main() {
  // Try to select from entity_checks with org_id — if rollback worked, this
  // column shouldn't exist.
  const { error: orgIdErr } = await supabase
    .from("entity_checks")
    .select("org_id")
    .limit(1);
  console.log("entity_checks.org_id exists?", !orgIdErr || !orgIdErr.message.includes("does not exist"));
  if (orgIdErr) console.log("  error:", orgIdErr.message);

  const { error: trackOrgErr } = await supabase
    .from("track_record_entries")
    .select("org_id")
    .limit(1);
  console.log("track_record_entries.org_id exists?", !trackOrgErr || !trackOrgErr.message.includes("does not exist"));
  if (trackOrgErr) console.log("  error:", trackOrgErr.message);

  const { error: trackCreatedErr } = await supabase
    .from("track_record_entries")
    .select("created_at")
    .limit(1);
  console.log("track_record_entries.created_at exists?", !trackCreatedErr || !trackCreatedErr.message.includes("does not exist"));
  if (trackCreatedErr) console.log("  error:", trackCreatedErr.message);

  const { error: rfErr } = await supabase
    .from("risk_factors")
    .select("expires_at")
    .limit(1);
  console.log("risk_factors.expires_at exists?", !rfErr || !rfErr.message.includes("does not exist"));
  if (rfErr) console.log("  error:", rfErr.message);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
