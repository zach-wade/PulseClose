"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Upload, AlertCircle, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

interface ExtractedRow {
  criteria_key: string;
  criteria_value: unknown;
  confidence?: "high" | "medium" | "low";
  known_key?: boolean;
}

interface ExtractResponse {
  extraction_id: string;
  document_id: string;
  rows: ExtractedRow[];
  stop_reason: string | null;
  model: string;
}

type EditableRow = ExtractedRow & {
  selected: boolean;
  // The text the user edits in the cell. Keep separate from
  // criteria_value so a parse error doesn't lose their typing.
  value_text: string;
  parse_error?: string;
};

const CONFIDENCE_VARIANT: Record<
  NonNullable<ExtractedRow["confidence"]>,
  "default" | "secondary" | "outline"
> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

interface Props {
  investorId: string;
  investorName: string;
  onAccepted: () => void;
}

export function InvestorExtractModal({ investorId, investorName, onAccepted }: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraction, setExtraction] = useState<ExtractResponse | null>(null);
  const [editable, setEditable] = useState<EditableRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function reset() {
    setExtraction(null);
    setEditable([]);
    setErrorMessage(null);
    setUploading(false);
    setSaving(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrorMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/investors/${investorId}/extract-criteria`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; code?: string; stop_reason?: string }
          | null;
        if (body?.code === "AI_DISABLED") {
          setErrorMessage(
            "AI extraction is disabled for this organization. Enable it in Settings → AI & Privacy, or paste the criteria manually via Edit criteria.",
          );
          return;
        }
        setErrorMessage(body?.error ?? `Upload failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as ExtractResponse;
      setExtraction(data);
      setEditable(
        data.rows.map((r) => ({
          ...r,
          selected: r.confidence !== "low",
          value_text: JSON.stringify(r.criteria_value, null, 2),
        })),
      );
      if (data.stop_reason === "max_tokens") {
        toast.warning(
          "Claude truncated the response. Some rows may be missing — re-extract a smaller PDF if needed.",
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Allow re-uploading the same file (browsers cache the input value).
      e.target.value = "";
    }
  }

  function toggleRow(i: number) {
    setEditable((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)),
    );
  }

  function selectAll(value: boolean) {
    setEditable((rows) => rows.map((r) => ({ ...r, selected: value })));
  }

  function editValue(i: number, text: string) {
    setEditable((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        let parse_error: string | undefined;
        try {
          JSON.parse(text);
        } catch (err) {
          parse_error = err instanceof Error ? err.message : "Invalid JSON";
        }
        return { ...r, value_text: text, parse_error };
      }),
    );
  }

  async function save() {
    if (!extraction) return;
    const accepted = editable.filter((r) => r.selected);
    if (accepted.length === 0) {
      toast.error("Select at least one row to save.");
      return;
    }
    // Re-parse value_text for each accepted row; abort with a clear error if
    // any row has a JSON syntax issue from the inline editor.
    const rows: Array<{ criteria_key: string; criteria_value: unknown }> = [];
    for (const r of accepted) {
      try {
        rows.push({
          criteria_key: r.criteria_key,
          criteria_value: JSON.parse(r.value_text),
        });
      } catch (err) {
        toast.error(
          `Row "${r.criteria_key}" has invalid JSON: ${
            err instanceof Error ? err.message : "parse failed"
          }`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/investors/${investorId}/criteria/from-extraction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extraction_id: extraction.extraction_id,
            rows,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | {
              error?: string;
              criteria_errors?: Array<{
                index: number;
                criteria_key: string;
                message: string;
              }>;
            }
          | null;
        if (body?.criteria_errors?.length) {
          const first = body.criteria_errors[0];
          toast.error(
            `${first.criteria_key}: ${first.message.slice(0, 100)}…`,
          );
        } else {
          toast.error(body?.error ?? `Save failed (${res.status})`);
        }
        return;
      }
      toast.success(`Saved ${rows.length} criteria row${rows.length === 1 ? "" : "s"}.`);
      setOpen(false);
      reset();
      onAccepted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = editable.filter((r) => r.selected).length;
  const allSelected = editable.length > 0 && selectedCount === editable.length;
  const anyParseError = editable.some((r) => r.selected && r.parse_error);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Sparkles className="mr-2 h-4 w-4" />
        Upload PDF
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extract criteria from PDF — {investorName}</DialogTitle>
          <DialogDescription>
            Upload the fund&apos;s underwriting guidelines PDF. Claude will
            extract criteria rows; review the preview and accept the ones
            that look right. Accepted rows will supersede any existing rows
            with the same <code className="text-xs">criteria_key</code>.
          </DialogDescription>
        </DialogHeader>

        {!extraction && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border-2 border-dashed border-input p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Drop a PDF here, or click to choose a file. PDF only, max 15MB.
              </p>
              <Label
                htmlFor="investor-pdf-input"
                className="mt-3 inline-block cursor-pointer text-sm text-primary underline"
              >
                {uploading ? "Extracting…" : "Choose PDF"}
              </Label>
              <input
                id="investor-pdf-input"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={uploading}
                onChange={handleFile}
              />
            </div>
            {errorMessage && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{errorMessage}</p>
              </div>
            )}
          </div>
        )}

        {extraction && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Extracted {extraction.rows.length} row
                {extraction.rows.length === 1 ? "" : "s"}.{" "}
                {selectedCount === editable.length
                  ? "All selected."
                  : `${selectedCount} selected.`}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => selectAll(!allSelected)}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>

            <div className="space-y-2">
              {editable.map((row, i) => (
                <div
                  key={`${row.criteria_key}-${i}`}
                  className={`rounded-md border p-3 ${
                    row.selected ? "border-foreground/30" : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleRow(i)}
                      className="flex items-center gap-2 text-left"
                    >
                      {row.selected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{row.criteria_key}</span>
                      {row.confidence && (
                        <Badge
                          variant={CONFIDENCE_VARIANT[row.confidence]}
                          className="text-xs"
                        >
                          {row.confidence}
                        </Badge>
                      )}
                      {row.known_key === false && (
                        <Badge variant="outline" className="text-xs">
                          unknown key
                        </Badge>
                      )}
                    </button>
                  </div>
                  {row.selected && (
                    <div className="mt-2">
                      <textarea
                        className="font-mono text-xs w-full h-20 border border-input rounded-md p-2 bg-transparent"
                        value={row.value_text}
                        onChange={(e) => editValue(i, e.target.value)}
                      />
                      {row.parse_error && (
                        <p className="text-xs text-destructive mt-1">
                          Invalid JSON: {row.parse_error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{errorMessage}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          {extraction && (
            <Button
              onClick={save}
              disabled={saving || selectedCount === 0 || anyParseError}
            >
              {saving
                ? "Saving…"
                : `Accept ${selectedCount} row${selectedCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
