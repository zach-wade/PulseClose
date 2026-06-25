import { createClient } from "./server";
import { createAdminClient } from "./admin";

interface UserProfile {
  id: string;
  email: string;
  org_id: string;
  full_name: string;
  role: string;
  /** "originator" (default) | "fund" — drives fund home routing (#29). */
  org_type: string;
}

// Resolve an org's type via the admin client (non-sensitive; reliable regardless
// of RLS). Defaults to "originator" if absent.
async function fetchOrgType(orgId: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("org_type")
    .eq("id", orgId)
    .maybeSingle();
  return (data as { org_type?: string } | null)?.org_type ?? "originator";
}

// Reliably gets the authenticated user + their org_id.
// Falls back to admin client if RLS blocks the profile query,
// and auto-creates the profile if the signup trigger failed.
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Try session-based client first (respects RLS)
  const { data: profile } = await supabase
    .from("users")
    .select("org_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (profile) {
    return { id: user.id, email: user.email ?? "", org_id: profile.org_id, full_name: profile.full_name ?? "", role: profile.role ?? "owner", org_type: await fetchOrgType(profile.org_id) };
  }

  // Fallback: use admin client to bypass RLS
  const admin = createAdminClient();
  const { data: adminProfile } = await admin
    .from("users")
    .select("org_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (adminProfile) {
    return { id: user.id, email: user.email ?? "", org_id: adminProfile.org_id, full_name: adminProfile.full_name ?? "", role: adminProfile.role ?? "owner", org_type: await fetchOrgType(adminProfile.org_id) };
  }

  // Profile doesn't exist — auto-create (trigger must have failed)
  const meta = user.user_metadata ?? {};
  const orgName = meta.org_name || meta.full_name || user.email?.split("@")[0] || "My Organization";
  const orgSlug =
    orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
    "-" +
    user.id.slice(0, 6);

  const { data: newOrg } = await admin
    .from("organizations")
    .insert({ name: orgName, slug: orgSlug, plan: "starter" })
    .select("id")
    .single();

  if (!newOrg) return null;

  await admin.from("users").insert({
    id: user.id,
    org_id: newOrg.id,
    email: user.email,
    full_name: meta.full_name || user.email?.split("@")[0] || "User",
    role: "owner",
  });

  const fullName = meta.full_name || user.email?.split("@")[0] || "User";
  return { id: user.id, email: user.email ?? "", org_id: newOrg.id, full_name: fullName, role: "owner", org_type: "originator" };
}
