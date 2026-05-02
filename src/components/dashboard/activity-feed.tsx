"use client";

// Activity feed renderer (B5). Used by:
//   - /dashboard/activity     full chronological feed for the org
//   - validation detail page  per-validation strip (closes G3.3)
//
// Each verb gets a distinct icon + sentence template. Unknown verbs
// fall through to a generic "<verb> on <subject>" line.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Check,
  ClipboardCheck,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  GitCompare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export interface ActivityFeedItem {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  verb: string;
  subject_type: string;
  subject_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  subject_label: string | null;
  subject_link: string | null;
}

interface VerbDescriptor {
  Icon: typeof Plus;
  iconClass: string;
  describe: (item: ActivityFeedItem) => string;
}

function actorPhrase(item: ActivityFeedItem): string {
  if (item.actor_name) return item.actor_name;
  if (item.actor_email) return item.actor_email.split("@")[0];
  return "Someone";
}

const VERB: Record<string, VerbDescriptor> = {
  created: {
    Icon: Plus,
    iconClass: "text-emerald-600 bg-emerald-50",
    describe: (i) => `${actorPhrase(i)} created a validation for ${i.subject_label}`,
  },
  updated: {
    Icon: RefreshCw,
    iconClass: "text-info bg-info/10",
    describe: (i) => {
      const verified = (i.metadata as { addresses_verified?: number }).addresses_verified;
      if (typeof verified === "number") {
        return `Deed-verified ${verified} address${verified === 1 ? "" : "es"} for ${i.subject_label}`;
      }
      return `Updated ${i.subject_label}`;
    },
  },
  applied_signal: {
    Icon: Check,
    iconClass: "text-amber-600 bg-amber-50",
    describe: (i) => {
      const key = (i.metadata as { signal_key?: string }).signal_key;
      const scope = (i.metadata as { scope?: string }).scope;
      if (key) {
        return `${actorPhrase(i)} applied "${key.replace(/_/g, " ")}" signal${scope ? ` (${scope})` : ""} on ${i.subject_label}`;
      }
      return `${actorPhrase(i)} applied an override on ${i.subject_label}`;
    },
  },
  ran_monitor: {
    Icon: ShieldCheck,
    iconClass: "text-info bg-info/10",
    describe: (i) => {
      const m = i.metadata as { changes_count?: number; status?: string };
      const changes = m.changes_count ?? 0;
      const status = m.status ?? "complete";
      if (status === "changes_found" || changes > 0) {
        return `Monitor for ${i.subject_label} found ${changes} change${changes === 1 ? "" : "s"}`;
      }
      if (status === "error") return `Monitor errored on ${i.subject_label}`;
      return `Monitor checked ${i.subject_label} — clean`;
    },
  },
  changed_tier: {
    Icon: TrendingUp,
    iconClass: "text-amber-600 bg-amber-50",
    describe: (i) => {
      const m = i.metadata as { from_tier?: string; to_tier?: string };
      return `Tier on ${i.subject_label} changed ${m.from_tier ?? "?"} → ${m.to_tier ?? "?"}`;
    },
  },
  sent_handoff: {
    Icon: FileSpreadsheet,
    iconClass: "text-indigo-600 bg-indigo-50",
    describe: (i) => {
      const artifact = (i.metadata as { artifact?: string }).artifact ?? "handoff";
      return `${actorPhrase(i)} downloaded ${i.subject_label} handoff (${artifact})`;
    },
  },
  sent_share_link: {
    Icon: Send,
    iconClass: "text-emerald-600 bg-emerald-50",
    describe: (i) => {
      const recipient = (i.metadata as { recipient_email?: string }).recipient_email;
      return `${actorPhrase(i)} sent share link for ${i.subject_label}${recipient ? ` to ${recipient}` : ""}`;
    },
  },
  compared: {
    Icon: GitCompare,
    iconClass: "text-purple-600 bg-purple-50",
    describe: (i) => `${actorPhrase(i)} compared ${i.subject_label} with another validation`,
  },
  evaluated_deal: {
    Icon: ClipboardCheck,
    iconClass: "text-info bg-info/10",
    describe: (i) => {
      const m = i.metadata as { investors_evaluated?: number; pass_count?: number };
      if (m.investors_evaluated != null) {
        const pass = m.pass_count != null ? `, ${m.pass_count} passed` : "";
        return `${actorPhrase(i)} evaluated ${i.subject_label} against ${m.investors_evaluated} investor${m.investors_evaluated === 1 ? "" : "s"}${pass}`;
      }
      return `${actorPhrase(i)} evaluated ${i.subject_label}`;
    },
  },
  regenerated_memo: {
    Icon: Sparkles,
    iconClass: "text-info bg-info/10",
    describe: (i) => `AI memo regenerated for ${i.subject_label}`,
  },
  uploaded_document: {
    Icon: FileSpreadsheet,
    iconClass: "text-info bg-info/10",
    describe: (i) => `${actorPhrase(i)} uploaded a document for ${i.subject_label}`,
  },
  uploaded_photo: {
    Icon: Eye,
    iconClass: "text-info bg-info/10",
    describe: (i) => `${actorPhrase(i)} uploaded photos for ${i.subject_label}`,
  },
};

const FALLBACK: VerbDescriptor = {
  Icon: Activity,
  iconClass: "text-muted-foreground bg-muted/40",
  describe: (i) => `${actorPhrase(i)} ${i.verb.replace(/_/g, " ")} on ${i.subject_label}`,
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ActivityFeed({
  items,
  groupByDay = true,
  emptyMessage = "No activity yet.",
  showSubjectLink = true,
}: {
  items: ActivityFeedItem[];
  groupByDay?: boolean;
  emptyMessage?: string;
  showSubjectLink?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>;
  }

  if (!groupByDay) {
    return (
      <ul className="space-y-2">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} showSubjectLink={showSubjectLink} />
        ))}
      </ul>
    );
  }

  const groups = new Map<string, ActivityFeedItem[]>();
  for (const item of items) {
    const k = dayKey(item.created_at);
    const arr = groups.get(k) ?? [];
    arr.push(item);
    groups.set(k, arr);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([day, dayItems]) => (
        <div key={day}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            {day}
          </p>
          <ul className="space-y-1.5">
            {dayItems.map((item) => (
              <ActivityRow key={item.id} item={item} showSubjectLink={showSubjectLink} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({
  item,
  showSubjectLink,
}: {
  item: ActivityFeedItem;
  showSubjectLink: boolean;
}) {
  const descriptor = VERB[item.verb] ?? FALLBACK;
  const { Icon, iconClass } = descriptor;
  return (
    <li className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors">
      <div className={`rounded-md p-1.5 shrink-0 ${iconClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{descriptor.describe(item)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {relativeTime(item.created_at)}
          {item.actor_email && (
            <>
              {" · "}
              <span title={item.actor_email}>{item.actor_email}</span>
            </>
          )}
        </p>
      </div>
      {showSubjectLink && item.subject_link && (
        <Link
          href={item.subject_link}
          className="text-xs text-info hover:underline shrink-0 inline-flex items-center gap-1"
        >
          Open
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </li>
  );
}

// Card wrapper for in-page strips with a heading + see-all link.
export function ActivityFeedCard({
  title,
  items,
  seeAllHref,
  emptyMessage,
  groupByDay = false,
}: {
  title: string;
  items: ActivityFeedItem[];
  seeAllHref?: string;
  emptyMessage?: string;
  groupByDay?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {title}
            {items.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {items.length}
              </Badge>
            )}
          </span>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="text-xs text-info hover:underline inline-flex items-center gap-1"
            >
              See all
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityFeed
          items={items}
          groupByDay={groupByDay}
          emptyMessage={emptyMessage ?? "No activity yet."}
        />
      </CardContent>
    </Card>
  );
}
