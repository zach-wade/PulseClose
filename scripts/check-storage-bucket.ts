// Read-only check: does the `documents` storage bucket exist on Supabase?
// If not, the migration 00017 will create it via storage.buckets DDL.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function main() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("Failed to list buckets:", error.message);
    process.exit(1);
  }
  console.log("Existing buckets:");
  for (const b of data ?? []) {
    console.log(`  ${b.name} (id=${b.id}, public=${b.public})`);
  }
  const documents = data?.find((b) => b.name === "documents");
  console.log(`\n"documents" bucket exists: ${!!documents}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
