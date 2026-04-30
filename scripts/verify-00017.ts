import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function tableExists(table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select("id").limit(1);
  if (!error) return true;
  return !error.message.includes("does not exist") && !error.message.includes("Could not find");
}

async function bucketExists(name: string): Promise<boolean> {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) return false;
  return !!data?.find((b) => b.name === name);
}

async function main() {
  console.log("X1 documents:");
  console.log(`  table exists: ${await tableExists("documents")}`);
  console.log(`  bucket exists: ${await bucketExists("documents")}`);

  console.log("\nX2 notification_preferences:");
  console.log(`  table exists: ${await tableExists("notification_preferences")}`);

  console.log("\nX3 activity_events:");
  console.log(`  table exists: ${await tableExists("activity_events")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
