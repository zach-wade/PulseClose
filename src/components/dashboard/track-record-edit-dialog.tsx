"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { TrackRecordEntry } from "./shared-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TrackRecordEntry | null;
  onSaved: () => void;
}

// Edit dialog for a track-record row. All edits flow through PATCH
// /api/track-record/[id] which logs the audit trail and triggers
// recompute. Reason field is optional but encouraged — the methodology
// PDF + handoff PDF render the reason next to the changed value.

export function TrackRecordEditDialog({ open, onOpenChange, entry, onSaved }: Props) {
  // useState initializers only fire on first mount. The parent keeps
  // this component mounted and swaps `entry` when the user clicks a
  // different row, so without re-syncing in an effect the inputs stay
  // empty / stuck at the first row's values. Reinit every time `entry`
  // changes OR the dialog re-opens (so reopening on the same row also
  // resets the unsaved reason field).
  const [acquisition_date, setAcqDate] = useState("");
  const [disposition_date, setDispDate] = useState("");
  const [acquisition_price, setAcqPrice] = useState("");
  const [disposition_price, setDispPrice] = useState("");
  const [hold_months, setHold] = useState("");
  const [profit, setProfit] = useState("");
  const [lender_notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry || !open) return;
    setAcqDate(entry.acquisition_date ?? "");
    setDispDate(entry.disposition_date ?? "");
    setAcqPrice(entry.acquisition_price != null ? String(entry.acquisition_price) : "");
    setDispPrice(entry.disposition_price != null ? String(entry.disposition_price) : "");
    setHold(entry.hold_months != null ? String(entry.hold_months) : "");
    setProfit(entry.profit != null ? String(entry.profit) : "");
    setNotes(entry.lender_notes ?? "");
    setReason("");
  }, [entry, open]);

  if (!entry) return null;

  function buildFields() {
    // Only include fields that actually changed — the API logs every
    // included field so untouched ones stay out of the audit log.
    const fields: Record<string, unknown> = {};
    const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
    if (acquisition_date !== (entry?.acquisition_date ?? "")) {
      fields.acquisition_date = acquisition_date || null;
    }
    if (disposition_date !== (entry?.disposition_date ?? "")) {
      fields.disposition_date = disposition_date || null;
    }
    if (
      acquisition_price !==
      (entry?.acquisition_price != null ? String(entry.acquisition_price) : "")
    ) {
      fields.acquisition_price = numOrNull(acquisition_price);
    }
    if (
      disposition_price !==
      (entry?.disposition_price != null ? String(entry.disposition_price) : "")
    ) {
      fields.disposition_price = numOrNull(disposition_price);
    }
    if (hold_months !== (entry?.hold_months != null ? String(entry.hold_months) : "")) {
      fields.hold_months = numOrNull(hold_months);
    }
    if (profit !== (entry?.profit != null ? String(entry.profit) : "")) {
      fields.profit = numOrNull(profit);
    }
    if (lender_notes.trim() !== (entry?.lender_notes ?? "").trim()) {
      fields.lender_notes = lender_notes.trim() || null;
    }
    return fields;
  }

  async function save() {
    const fields = buildFields();
    if (Object.keys(fields).length === 0) {
      toast.info("Nothing changed.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/track-record/${entry!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(error || "Save failed");
        return;
      }
      toast.success("Saved. Tier + AI memo recomputing.");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `Delete this row from track record? "${entry?.property_address}". The deletion is logged with the reason you provide; investor handoff PDF will note the row was removed.`,
      )
    )
      return;
    setSaving(true);
    try {
      const r = reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : "";
      const res = await fetch(`/api/track-record/${entry!.id}${r}`, { method: "DELETE" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Delete failed" }));
        toast.error(error || "Delete failed");
        return;
      }
      toast.success("Row deleted. Tier + AI memo recomputing.");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit track record row</DialogTitle>
          <DialogDescription>
            {entry.property_address}. Edits are logged with timestamp +
            reason and shown on the investor handoff PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acq_date">Acquisition date</Label>
              <Input
                id="acq_date"
                type="date"
                value={acquisition_date}
                onChange={(e) => setAcqDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disp_date">Disposition date</Label>
              <Input
                id="disp_date"
                type="date"
                value={disposition_date}
                onChange={(e) => setDispDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acq_price">Acquisition price ($)</Label>
              <Input
                id="acq_price"
                type="number"
                value={acquisition_price}
                onChange={(e) => setAcqPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disp_price">Disposition price ($)</Label>
              <Input
                id="disp_price"
                type="number"
                value={disposition_price}
                onChange={(e) => setDispPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hold_months">Hold months</Label>
              <Input
                id="hold_months"
                type="number"
                value={hold_months}
                onChange={(e) => setHold(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profit">Profit ($)</Label>
              <Input
                id="profit"
                type="number"
                value={profit}
                onChange={(e) => setProfit(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Lender notes (visible on handoff)</Label>
            <textarea
              id="notes"
              className="w-full text-sm rounded-md border border-input bg-transparent p-2 h-20"
              value={lender_notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Borrower confirms hold was 12 months, vendor data was wrong by half a year."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason for edit (audit trail)</Label>
            <textarea
              id="reason"
              className="w-full text-sm rounded-md border border-input bg-transparent p-2 h-16"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional. Explanation that goes into the audit log."
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <Button variant="ghost" onClick={remove} disabled={saving}>
            Delete row
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
