// Public borrower-facing page for trust-but-verify track record.
// No auth required — the share token in the URL is the credential.
// Borrower pastes addresses they claim to have flipped; we run them
// through Realie's deed-chain check and show the results.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShareSubmitForm } from "./share-submit-form";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, borrower_name, borrower_entity_name, share_token")
    .eq("share_token", token)
    .single();

  if (!validation) notFound();

  // Pre-load any existing verified flips so the borrower sees their
  // last submission if they revisit the link.
  const { data: existingFlips } = await supabase
    .from("verified_flips")
    .select("*")
    .eq("validation_id", validation.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-slate-900 text-white flex items-center justify-center text-sm font-bold">P</div>
            <span className="font-semibold">PulseClose</span>
          </div>
          <span className="text-xs text-muted-foreground">Borrower Track Record Verification</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Verify your track record, {validation.borrower_name}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your lender requested this so they can verify the properties
            you&apos;ve owned and flipped. Paste your address list below
            (one per line) and we&apos;ll cross-check each one against the
            public deed records. Nothing is shared with the lender beyond
            what they already see in your validation.
          </p>
        </div>

        <ShareSubmitForm
          token={token}
          borrowerName={validation.borrower_name}
          entityName={validation.borrower_entity_name}
          initialFlips={existingFlips ?? []}
        />

        <p className="text-xs text-muted-foreground text-center pt-6 border-t">
          Powered by PulseClose · This page is private to you and your lender.
        </p>
      </main>
    </div>
  );
}
