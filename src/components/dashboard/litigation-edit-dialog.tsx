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
import type { LitigationCaseRow } from "./litigation-cards";

const CATEGORIES = ["bankruptcy", "civil", "lien", "tax", "foreclosure", "other"] as const;
const STATUSES = ["pending", "closed", "discharged", "dismissed", "judgment", "unknown"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseRow: LitigationCaseRow | null;
  onSaved: () => void;
}

// Edit dialog for a litigation case row. Editing this doesn't directly
// re-derive the active_fed_litigation factor (the engine reads from
// litigation_checks not litigation_cases). To exclude the factor
// entirely use Override on the factor row in WhyThisRating. Edits here
// update the displayed data + audit trail.

export function LitigationEditDialog({ open, onOpenChange, caseRow, onSaved }: Props) {
  const [case_name, setCaseName] = useState(caseRow?.case_name ?? "");
  const [case_number, setCaseNumber] = useState(caseRow?.case_number ?? "");
  const [court, setCourt] = useState(caseRow?.court ?? "");
  const [filed_at, setFiledAt] = useState(caseRow?.filed_at ?? "");
  const [terminated_at, setTerminatedAt] = useState(caseRow?.terminated_at ?? "");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>(
    (caseRow?.category as typeof CATEGORIES[number]) ?? "other",
  );
  const [status, setStatus] = useState<typeof STATUSES[number]>(
    (caseRow?.status as typeof STATUSES[number]) ?? "unknown",
  );
  const [dollar_amount_estimated, setDollarAmount] = useState(
    caseRow?.dollar_amount_estimated != null ? String(caseRow.dollar_amount_estimated) : "",
  );
  const [lender_notes, setNotes] = useState(caseRow?.lender_notes ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!caseRow) return null;

  function buildFields() {
    const fields: Record<string, unknown> = {};
    const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
    if (case_name !== (caseRow!.case_name ?? "")) fields.case_name = case_name;
    if (case_number !== (caseRow!.case_number ?? "")) fields.case_number = case_number || null;
    if (court !== (caseRow!.court ?? "")) fields.court = court || null;
    if (filed_at !== (caseRow!.filed_at ?? "")) fields.filed_at = filed_at || null;
    if (terminated_at !== (caseRow!.terminated_at ?? "")) fields.terminated_at = terminated_at || null;
    if (category !== caseRow!.category) fields.category = category;
    if (status !== caseRow!.status) fields.status = status;
    if (
      dollar_amount_estimated !==
      (caseRow!.dollar_amount_estimated != null ? String(caseRow!.dollar_amount_estimated) : "")
    ) {
      fields.dollar_amount_estimated = numOrNull(dollar_amount_estimated);
    }
    if (lender_notes.trim() !== (caseRow!.lender_notes ?? "").trim()) {
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
      const res = await fetch(`/api/litigation-cases/${caseRow!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(error || "Save failed");
        return;
      }
      toast.success("Case updated.");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `Delete this case from the validation? "${caseRow!.case_name}". The deletion is logged with reason; investor handoff PDF will note the case was removed.`,
      )
    )
      return;
    setSaving(true);
    try {
      const r = reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : "";
      const res = await fetch(`/api/litigation-cases/${caseRow!.id}${r}`, { method: "DELETE" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Delete failed" }));
        toast.error(error || "Delete failed");
        return;
      }
      toast.success("Case deleted.");
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
          <DialogTitle>Edit case</DialogTitle>
          <DialogDescription>
            {caseRow.case_name}. Edits log with reason and surface on
            handoff PDF. To exclude this case&apos;s factor from tier
            entirely, use the Override button on the active federal
            litigation row in &ldquo;Why this rating?&rdquo;.
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
              <Input id="court" value={court} onChange={(e) => setCourt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filed_at">Filed at</Label>
              <Input id="filed_at" type="date" value={filed_at} onChange={(e) => setFiledAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terminated_at">Terminated at</Label>
              <Input
                id="terminated_at"
                type="date"
                value={terminated_at}
                onChange={(e) => setTerminatedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
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
              <Label htmlFor="status">Status</Label>
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
              <Input
                id="dollar"
                type="number"
                value={dollar_amount_estimated}
                onChange={(e) => setDollarAmount(e.target.value)}
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
              placeholder="e.g. Reviewed with borrower's counsel — frivolous nuisance suit, settled out of court for $0."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason for edit (audit trail)</Label>
            <textarea
              id="reason"
              className="w-full text-sm rounded-md border border-input bg-transparent p-2 h-16"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional. Audit log entry."
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <Button variant="ghost" onClick={remove} disabled={saving}>
            Delete case
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
