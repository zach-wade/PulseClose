// Create a confirmed test user for live pixel-driving the app per persona.
//
// Mirrors the signup path exactly: signup calls supabase.auth.signUp with
// raw_user_meta_data { full_name, org_name }, and the on_auth_user_created
// trigger (00002_handle_new_user) creates the organizations + users rows and
// stamps the 14-day trial (00041). So all this script must do is create a
// confirmed auth user with that same metadata — the trigger does the rest.
//
// Run with (vars optional; sensible persona defaults below):
//   EMAIL=uw@test.pulseclose.com PASSWORD=Test1234! \
//   ORG_NAME="Test Bridge Capital" FULL_NAME="Test Underwriter" \
//   npx tsx scripts/create-test-user.ts
//
// Idempotent: if the email already exists, it reuses that user (and re-confirms
// + resets the password) rather than erroring. Prints the user id + org id so
// the seed scripts (ORG_ID=… npx tsx scripts/seed-*.ts) can target the org.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const ORG_NAME = process.env.ORG_NAME ?? "Test Bridge Capital";
const FULL_NAME = process.env.FULL_NAME ?? "Test Underwriter";

async function findUserByEmail(email: string) {
  // listUsers is paginated; scan pages until we find the email or run out.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(EMAIL);

  let userId: string;
  if (existing) {
    userId = existing.id;
    // Re-confirm + reset password so a stale test user is always usable.
    await supabase.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
    });
    console.log(`Reusing existing auth user ${EMAIL} → ${userId}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME, org_name: ORG_NAME },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user");
    userId = data.user.id;
    console.log(`Created auth user ${EMAIL} → ${userId}`);
  }

  // The trigger runs synchronously inside the auth.users insert, so the
  // users/organizations rows exist by now. Read back the org for the seeders.
  const { data: profile, error: profErr } = await supabase
    .from("users")
    .select("org_id, full_name, role, organizations(name, slug, plan, trial_ends_at)")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;

  if (!profile) {
    console.warn(
      "⚠ No public.users row for this user — the handle_new_user trigger may not have run.\n" +
        "  (This can happen for a pre-existing user created before the trigger, or if the\n" +
        "  trigger is missing in this environment.) Org-dependent seeding will not work.",
    );
  } else {
    console.log("\n--- Sign-in ready ---");
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  User id:  ${userId}`);
    console.log(`  Org id:   ${profile.org_id}`);
    console.log(`  Org:      ${JSON.stringify(profile.organizations)}`);
    console.log(`\nSeed investors:  ORG_ID=${profile.org_id} npx tsx scripts/seed-sample-investors.ts`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
