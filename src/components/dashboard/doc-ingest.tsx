"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileUp, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface IngestExtraction {
  borrower_name: string | null;
  borrower_entity_name: string | null;
  entity_state: string | null;
  guarantor_name: string | null;
  gc_name: string | null;
  gc_license_number: string | null;
  gc_state: string | null;
  property_addresses: string[];
  // Underwriting values from the package — pre-fill the sizing workbench.
  loan_amount: number | null;
  purchase_price: number | null;
  as_is_value: number | null;
  arv: number | null;
  rehab_budget: number | null;
  fico: number | null;
  // Income-property economics (appraisal / pro-forma) — pre-fill Sizing's
  // DSCR/debt-yield inputs so the UW doesn't re-key the pro-forma.
  current_noi: number | null;
  stabilized_noi: number | null;
  going_in_cap_rate: number | null;
  exit_cap_rate: number | null;
  property_type: string | null;
  loan_purpose: string | null;
  notes: string | null;
}

interface Props {
  onExtracted: (data: IngestExtraction) => void;
}

export function DocIngest({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setLastFileName(file.name);
    try {
      // Upload the file STRAIGHT to Supabase Storage from the browser — this
      // bypasses Vercel's ~4.5MB serverless body cap, so real loan packages
      // (5–8MB) and appraisals go through. The API then reads it from storage.
      // (Finding #26.)
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not signed in");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
      const storagePath = `ingest-tmp/${userId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) {
        // Bucket size-limit and similar surface here with a clear message.
        throw new Error(`Upload failed: ${upErr.message}`);
      }

      const res = await fetch("/api/ingest/borrower-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath, filename: file.name, content_type: file.type }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Extraction failed (${res.status})`);
      }
      const json = (await res.json()) as IngestExtraction;
      onExtracted(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={`border-dashed ${dragOver ? "border-info bg-info/5" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-info/10 p-2 shrink-0">
            <FileUp className="h-4 w-4 text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Skip the form — drop a borrower intake PDF, Excel, or CSV
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Claude reads the file and pre-fills the borrower / entity / GC fields below. You review before running. (PDF, Excel, or CSV — up to 50MB.)
            </p>
            {lastFileName && !error && !busy && (
              <p className="text-xs mt-1.5 flex items-center gap-1 text-emerald-700">
                <Sparkles className="h-3 w-3" />
                Extracted from <span className="font-medium">{lastFileName}</span> — review fields below
              </p>
            )}
            {error && (
              <p className="text-xs mt-1.5 flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {busy ? "Extracting…" : "Upload"}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
