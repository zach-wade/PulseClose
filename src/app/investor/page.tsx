// F3 — Investor-side landing page (placeholder).
//
// Substrate (00031) is in: investor_users + investor_deal_queue with
// RLS letting an investor_user read/update queue rows tied to their
// investor_id. Full deal-queue UI ships post-NPLA; this page exists so
// a logged-in investor_user has somewhere to land, and so the route
// shape (/investor) is reserved.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function InvestorLandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?role=investor");

  // Lookup the investor_user row for this auth user.
  const { data: invUser } = await supabase
    .from("investor_users")
    .select("id, full_name, role, investor_id, investors ( display_name )")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!invUser) {
    return (
      <main className="max-w-2xl mx-auto p-8 space-y-4">
        <h1 className="text-2xl font-bold">Not an investor account</h1>
        <p className="text-sm text-muted-foreground">
          This login isn&apos;t linked to an investor record. If you should
          be one, ask the originator who routed you here.
        </p>
      </main>
    );
  }

  // Pull queue rows under RLS — investor_deal_queue_investor_self.
  const { data: queue } = await supabase
    .from("investor_deal_queue")
    .select("id, validation_id, status, investor_comment, created_at")
    .order("created_at", { ascending: false }) as {
      data: Array<{
        id: string;
        validation_id: string;
        status: string;
        investor_comment: string | null;
        created_at: string;
      }> | null;
    };

  const investorRow = Array.isArray(invUser.investors) ? invUser.investors[0] : invUser.investors;

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {investorRow?.display_name ?? "Investor"} deal queue
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome, {invUser.full_name}. Deals routed to you appear below
          oldest-first. The full review UI lands post-NPLA — for now you
          can see what&apos;s queued.
        </p>
      </header>
      <section className="space-y-2">
        {(queue ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No deals routed yet.
          </p>
        ) : (
          (queue ?? []).map((q) => (
            <div key={q.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium font-mono">{q.validation_id}</p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {q.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Routed {new Date(q.created_at).toLocaleString()}
              </p>
              {q.investor_comment && (
                <p className="text-xs italic">{q.investor_comment}</p>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
