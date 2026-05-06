"use client";

import { useState } from "react";
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

// Add a property to the track record manually. Use when vendors missed
// it but the lender has direct knowledge of the borrower's ownership.
// source='manual' on the row so handoff distinguishes vendor truth from
// lender additions.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationId: string;
  onAdded: () => void;
}

export function TrackRecordAddDialog({ open, onOpenChange, validationId, onAdded }: Props) {
  const [property_address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [acquisition_date, setAcqDate] = useState("");
  const [disposition_date, setDispDate] = useState("");
  const [acquisition_price, setAcqPrice] = useState("");
  const [disposition_price, setDispPrice] = useState("");
  const [hold_months, setHold] = useState("");
  const [lender_notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setAddress("");
    setCity("");
    setState("");
    setZip("");
    setAcqDate("");
    setDispDate("");
    setAcqPrice("");
    setDispPrice("");
    setHold("");
    setNotes("");
    setReason("");
  }

  async function save() {
    if (!property_address.trim()) {
      toast.error("Property address required.");
      return;
    }
    setSaving(true);
    try {
      const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
      const res = await fetch(`/api/validations/${validationId}/track-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_address: property_address.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          acquisition_date: acquisition_date || null,
          disposition_date: disposition_date || null,
          acquisition_price: numOrNull(acquisition_price),
          disposition_price: numOrNull(disposition_price),
          hold_months: numOrNull(hold_months),
          lender_notes: lender_notes.trim() || null,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(error || "Save failed");
        return;
      }
      toast.success("Property added. Tier + AI memo recomputing.");
      reset();
      onAdded();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add property to track record</DialogTitle>
          <DialogDescription>
            Use when vendors missed a property the borrower owns. Marked
            <code className="text-xs mx-1">source=manual</code> so the
            investor handoff distinguishes manual rows from vendor data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="addr">Address *</Label>
            <Input
              id="addr"
              value={property_address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, San Francisco, CA 94110"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zip">Zip</Label>
              <Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acq_date">Acquisition date</Label>
              <Input id="acq_date" type="date" value={acquisition_date} onChange={(e) => setAcqDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disp_date">Disposition date (if sold)</Label>
              <Input id="disp_date" type="date" value={disposition_date} onChange={(e) => setDispDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acq_price">Acquisition price ($)</Label>
              <Input id="acq_price" type="number" value={acquisition_price} onChange={(e) => setAcqPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disp_price">Disposition price ($)</Label>
              <Input id="disp_price" type="number" value={disposition_price} onChange={(e) => setDispPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hold_months">Hold months</Label>
              <Input id="hold_months" type="number" value={hold_months} onChange={(e) => setHold(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Lender notes (visible on handoff)</Label>
            <textarea
              id="notes"
              className="w-full text-sm rounded-md border border-input bg-transparent p-2 h-16"
              value={lender_notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason for adding (audit trail)</Label>
            <textarea
              id="reason"
              className="w-full text-sm rounded-md border border-input bg-transparent p-2 h-16"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Borrower listed this property in their LLC operating agreement; vendor search missed it."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !property_address.trim()}>
            {saving ? "Adding…" : "Add property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
