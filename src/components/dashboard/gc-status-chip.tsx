"use client";

// GC status chip for the dashboard list. Reads the cached gc_summary jsonb
// (populated by api/validations + api/checks/gc, backfilled by 00019).
//
// Color: green (active+clean), amber (active+discipline), gray (manual
// review for non-CA states or no GC pillar), red (expired/suspended/revoked).
// Hover tooltip surfaces full license details + expiration.

import { ShieldCheck, ShieldAlert, ShieldX, Shield } from "lucide-react";

export interface GCSummaryView {
  schema_version?: number;
  status:
    | "active"
    | "active_with_discipline"
    | "manual_review"
    | "expired"
    | "suspended"
    | "revoked"
    | "none";
  license_id: string | null;
  state: string | null;
  classifications: string[];
  expires_at: string | null;
  has_discipline: boolean;
}

interface Props {
  summary: GCSummaryView | null | undefined;
}

const STATUS_LABEL: Record<GCSummaryView["status"], string> = {
  active: "Active",
  active_with_discipline: "Active · prior discipline",
  manual_review: "Manual review",
  expired: "Expired",
  suspended: "Suspended",
  revoked: "Revoked",
  none: "No GC",
};

function statusColors(status: GCSummaryView["status"]): {
  bg: string;
  text: string;
  border: string;
  Icon: typeof Shield;
} {
  switch (status) {
    case "active":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        Icon: ShieldCheck,
      };
    case "active_with_discipline":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        Icon: ShieldAlert,
      };
    case "manual_review":
      return {
        bg: "bg-slate-50",
        text: "text-slate-600",
        border: "border-slate-200",
        Icon: Shield,
      };
    case "expired":
    case "suspended":
    case "revoked":
      return {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        Icon: ShieldX,
      };
    case "none":
    default:
      return {
        bg: "bg-transparent",
        text: "text-muted-foreground",
        border: "border-transparent",
        Icon: Shield,
      };
  }
}

export function GCStatusChip({ summary }: Props) {
  if (!summary || summary.status === "none") {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const { bg, text, border, Icon } = statusColors(summary.status);
  const stateLabel = summary.state ?? "?";
  // Compact label for desktop column; mobile chip uses the same shape.
  const label =
    summary.status === "manual_review"
      ? `${stateLabel}: manual`
      : summary.license_id
        ? `${stateLabel} #${summary.license_id}`
        : stateLabel;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${bg} ${text} ${border}`}
      title={tooltipText(summary)}
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[140px]">{label}</span>
    </div>
  );
}

function tooltipText(s: GCSummaryView): string {
  const parts: string[] = [STATUS_LABEL[s.status]];
  if (s.license_id) parts.push(`License #${s.license_id}`);
  if (s.state) parts.push(`State: ${s.state}`);
  if (s.classifications.length > 0) parts.push(`Class: ${s.classifications.join(", ")}`);
  if (s.expires_at) parts.push(`Expires ${new Date(s.expires_at).toLocaleDateString()}`);
  if (s.has_discipline) parts.push("Has prior disciplinary actions");
  return parts.join(" · ");
}
