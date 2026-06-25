// Verify the #18 mandate fix directly against the real persisted validations —
// re-assess the fresh real-loan runs with the current (local) assess.ts logic
// and print the verdict + reasons. No vendor calls. Run:
//   set -a; source .env.local; set +a; npx tsx scripts/verify-mandate-fix.ts

import { createClient } from "@supabase/supabase-js";
import { assessValidationMandates } from "../src/lib/mandates/assess";

const ORG = "27296b6b-87f2-4b71-9e84-2c71f652449c";
const VIDS = [
  { id: "7f8e263f-b673-4040-afd4-9bb8ae1d03ea", who: "Kafetzopoulos (clean, entity 429)" },
  { id: "749d3934-bba4-48d7-b644-9633b1368e1a", who: "Soverns (clean, entity 429)" },
  { id: "ddcb6fcf-5b6a-4351-829b-1c95994286e9", who: "Mark Morrison (common name, tier 4)" },
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  for (const v of VIDS) {
    const assessments = await assessValidationMandates(supabase, ORG, v.id, { fireWebhook: false });
    console.log(`\n${v.who}`);
    for (const a of assessments) {
      console.log(`  ${a.mandate_name}: ${a.result.toUpperCase()}`);
      for (const f of a.failures) console.log(`     - [${f.gate}] ${f.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
