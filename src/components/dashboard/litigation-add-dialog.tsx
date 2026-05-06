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

const CATEGORIES = ["bankruptcy", "civil", "lien", "tax", "foreclosure", "other"] as const;
const STATUSES = ["pending", "closed", "discharged", "dismissed", "judgment", "unknown"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationId: string;
  onAdded: () => void;
}

// Manually add a case the vendors didn't surface (state court, county
// lien, tax warrant, settlement). source='manual' on the row so the
// handoff distinguishes lender additions from CourtListener results.

export function LitigationAddDialog({ open, onOpenChange, validationId, onAdded }: Props) {
  const [case_name, setCaseName] = useState("");
  const [case_number, setCaseNumber] = useState("");
  const [court, setCourt] = useState("");
  const [filed_at, setFiledAt] = useState("");
  const [terminated_at, setTerminatedAt] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("civil");
  const [status, setStatus] = useState<typeof STATUSES[number]>("pending");
  const [dollar_amount_estimated, setDollarAmount] = useState("");
  const [lender_notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setCaseName("");
    setCaseNumber("");
    setCourt("");
    setFiledAt("");
    setTerminatedAt("");
    setCategory("civil");
    setStatus("pending");
    setDollarAmount("");
    setNotes("");
    setReason("");
  }

  async function save() {
    if (!case_name.trim()) {
      toast.error("Case name required.");
      return;
    }
    setSaving(true);
    try {
      const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
      const res = await fetch(`/api/validations/${validationId}/litigation-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_name: case_name.trim(),
          case_number: case_number.trim() || null,
          court: court.trim() || null,
          filed_at: filed_at || null,
          terminated_at: terminated_at || null,
          category,
          status,
          dollar_amount_estimated: numOrNull(dollar_amount_estimated),
          lender_notes: lender_notes.trim() || null,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(error || "Save failed");
        return;
      }
      toast.success("Case added.");
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
          <DialogTitle>Add case</DialogTitle>
          <DialogDescription>
            For state court, county lien, tax warrant, or any case the
            vendor search missed. Marked source=manual so the handoff
            distinguishes it from automated CourtListener results.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="case_name">Case name *</Label>
            <Input id="case_name" value={case_name} onChange={(e) => setCaseName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="case_number">Case number</Label>
              <Input id="case_number" value={case_number} onChange={(e) => setCaseNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="court">Court</Label>
              <Input id="court" value={court} onChange={(e) => setCourt(e.target.value)} placeholder="e.g. Santa Clara County Superior Court" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filed_at">Filed at</Label>
              <Input id="filed_at" type="date" value={filed_at} onChange={(e) => setFiledAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terminated_at">Terminated at</Label>
              <Input id="terminated_at" type="date" value={terminated_at} onChange={(e) => setTerminatedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category *</Label>
              <select
                id="category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status *</Label>
              <select
                id="status"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof STATUSES[number])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dollar">Dollar amount ($)</Label>
              <Input id="dollar" type="number" value={dollar_amount_estimated} onChange={(e) => setDollarAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Lender notes (visible on handoff)</Label>
            <textarea
              id="notes"
              className="w-full text-sm rounded-md border border-input bg-transparent p-2 h-20"
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
              placeholder="e.g. Found via state court records search; CourtListener doesn't cover this jurisdiction."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !case_name.trim()}>
            {saving ? "Adding…" : "Add case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
