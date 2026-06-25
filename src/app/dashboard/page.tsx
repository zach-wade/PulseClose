// Dashboard home — server component. A FUND / capital provider lands on the
// Mandate Console (the capital-provider's view of the verdict), not the
// originator "run your first validation" onboarding (#29). Everyone else gets
// the originator Borrowers home.
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { DashboardHome } from "./dashboard-home";

export default async function DashboardPage() {
  const profile = await getUserProfile();
  if (profile?.org_type === "fund") {
    redirect("/dashboard/capital/mandates");
  }
  return <DashboardHome />;
}
