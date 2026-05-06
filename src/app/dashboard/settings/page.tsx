"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Key,
  Building2,
  Crown,
  UserPlus,
  Copy,
  RefreshCw,
  Check,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

interface SettingsData {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    created_at: string;
    stripe_subscription_id: string | null;
    ai_extraction_enabled: boolean;
    monitor_new_validations_by_default: boolean;
  } | null;
  team: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    created_at: string;
  }[];
}

const plans = [
  {
    name: "Starter",
    price: "$299",
    checks: "20 checks/month",
    features: ["Entity validation", "Track record", "Litigation screening", "Email support"],
  },
  {
    name: "Pro",
    price: "$499",
    checks: "50 checks/month",
    features: ["Everything in Starter", "GC validation", "AI risk analysis", "Priority support"],
  },
  {
    name: "Enterprise",
    price: "$799",
    checks: "Unlimited checks",
    features: ["Everything in Pro", "API access", "Custom integrations", "Dedicated CSM"],
  },
];

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [aiToggleSaving, setAiToggleSaving] = useState(false);
  const [monitorDefaultSaving, setMonitorDefaultSaving] = useState(false);

  async function handleMonitorDefaultToggle(next: boolean) {
    if (!data?.org) return;
    setMonitorDefaultSaving(true);
    const prev = data.org.monitor_new_validations_by_default;
    setData({ ...data, org: { ...data.org, monitor_new_validations_by_default: next } });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitor_new_validations_by_default: next }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Update failed" }));
        toast.error(error || "Update failed");
        setData({ ...data, org: { ...data.org, monitor_new_validations_by_default: prev } });
      } else {
        toast.success(next ? "Auto-monitoring enabled" : "Auto-monitoring disabled");
      }
    } catch {
      toast.error("Update failed");
      setData({ ...data, org: { ...data.org, monitor_new_validations_by_default: prev } });
    } finally {
      setMonitorDefaultSaving(false);
    }
  }

  async function handleAiToggle(next: boolean) {
    if (!data?.org) return;
    setAiToggleSaving(true);
    // Optimistic — revert on failure so the UI doesn't lie about state.
    const prev = data.org.ai_extraction_enabled;
    setData({ ...data, org: { ...data.org, ai_extraction_enabled: next } });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_extraction_enabled: next }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Update failed" }));
        toast.error(error || "Update failed");
        setData({ ...data, org: { ...data.org, ai_extraction_enabled: prev } });
      } else {
        toast.success(next ? "AI extraction enabled" : "AI extraction disabled");
      }
    } catch {
      toast.error("Update failed");
      setData({ ...data, org: { ...data.org, ai_extraction_enabled: prev } });
    } finally {
      setAiToggleSaving(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const mockApiKey = "pc_live_" + "x".repeat(24) + "a8f3";

  function handleCopyKey() {
    navigator.clipboard.writeText(mockApiKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    toast.success(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Organization, team, and integration configuration
          </p>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Organization, team, and integration configuration
        </p>
      </div>

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">
            <Building2 className="mr-2 h-4 w-4" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="mr-2 h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="api">
            <Key className="mr-2 h-4 w-4" />
            API Keys
          </TabsTrigger>
        </TabsList>

        {/* Org tab */}
        <TabsContent value="org" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organization Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Organization Name</Label>
                  <Input value={data.org?.name ?? ""} readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug</Label>
                  <Input value={data.org?.slug ?? ""} readOnly />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Member Since</Label>
                <p className="text-sm text-muted-foreground">
                  {data.org?.created_at
                    ? new Date(data.org.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                AI &amp; Privacy
              </CardTitle>
              <CardDescription>
                Controls whether borrower documents and risk memos pass through
                Anthropic Claude. PulseClose strips SSNs, phones, and emails
                from spreadsheet / CSV inputs before sending (PDFs go to
                Claude&apos;s native PDF support intact), and the risk memo
                prompt uses placeholder tokens for borrower / entity /
                property / lender names so Claude never sees them. Use this
                toggle if your org policy forbids any LLM exposure of
                borrower data, including via PDF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">AI extraction &amp; risk memo</p>
                  <p className="text-xs text-muted-foreground">
                    {data.org?.ai_extraction_enabled
                      ? "Enabled — doc ingestion auto-fills the form, share-link uploads extract addresses, and validations get a Story Mode risk memo."
                      : "Disabled — fill the form manually; validations still run with deterministic risk factors but no AI memo."}
                  </p>
                </div>
                <Button
                  variant={data.org?.ai_extraction_enabled ? "outline" : "default"}
                  size="sm"
                  disabled={aiToggleSaving}
                  onClick={() =>
                    handleAiToggle(!data.org?.ai_extraction_enabled)
                  }
                >
                  {data.org?.ai_extraction_enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monitoring defaults</CardTitle>
              <CardDescription>
                Continuous monitoring re-runs entity, sanctions, and
                litigation checks on a cadence and emails you on change.
                When enabled below, every new validation gets a default
                weekly subscription auto-created. You can still toggle
                per-validation or per-borrower from the validation
                detail page. Borrower-level subscriptions take precedence
                over this org default.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Auto-monitor every new validation</p>
                  <p className="text-xs text-muted-foreground">
                    {data.org?.monitor_new_validations_by_default
                      ? "Enabled — new validations get a weekly monitor subscription on creation."
                      : "Disabled — monitoring opts in per-validation or per-borrower."}
                  </p>
                </div>
                <Button
                  variant={data.org?.monitor_new_validations_by_default ? "outline" : "default"}
                  size="sm"
                  disabled={monitorDefaultSaving}
                  onClick={() =>
                    handleMonitorDefaultToggle(!data.org?.monitor_new_validations_by_default)
                  }
                >
                  {data.org?.monitor_new_validations_by_default ? "Disable" : "Enable"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Your organization is on the{" "}
                <span className="font-medium capitalize">{data.org?.plan}</span>{" "}
                plan.
                {data.org?.plan === "internal" && (
                  <>
                    {" "}
                    <span className="text-muted-foreground">
                      (Internal — unlimited checks; not billable. Not shown in
                      the upgrade matrix below.)
                    </span>
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {plans.map((plan) => (
                  <div
                    key={plan.name}
                    className={`rounded-lg border p-4 space-y-3 ${
                      plan.name.toLowerCase() === data.org?.plan
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div>
                      <h4 className="font-semibold">{plan.name}</h4>
                      <p className="text-2xl font-bold mt-1">
                        {plan.price}
                        <span className="text-sm font-normal text-muted-foreground">
                          /mo
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {plan.checks}
                      </p>
                    </div>
                    <Separator />
                    <ul className="space-y-1.5">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="text-sm text-muted-foreground flex items-center gap-2"
                        >
                          <Check className="h-3 w-3 text-success" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {plan.name.toLowerCase() === data.org?.plan ? (
                      <Badge variant="default">Current Plan</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/stripe/checkout", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                plan: plan.name.toLowerCase(),
                                interval: "monthly",
                              }),
                            });
                            const { url, error } = await res.json();
                            if (url) {
                              window.location.href = url;
                            } else {
                              toast.error(error || "Failed to start checkout");
                            }
                          } catch {
                            toast.error("Failed to start checkout");
                          }
                        }}
                      >
                        {plan.name === "Enterprise"
                          ? "Contact Sales"
                          : "Upgrade"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {data.org?.stripe_subscription_id && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch("/api/stripe/portal", { method: "POST" });
                  const { url, error } = await res.json();
                  if (url) {
                    window.location.href = url;
                  } else {
                    toast.error(error || "Failed to open billing portal");
                  }
                } catch {
                  toast.error("Failed to open billing portal");
                }
              }}
            >
              Manage Billing
            </Button>
          )}
        </TabsContent>

        {/* Team tab */}
        <TabsContent value="team" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Team Members</CardTitle>
                <Badge variant="secondary">
                  {data.team.length} member{data.team.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.team.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.full_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(member.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Invite Team Member
                <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Team invitations are coming soon. Contact us to add team members to your organization.
              </p>
              <form onSubmit={handleInvite} className="flex gap-4 opacity-50 pointer-events-none">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="invite_email">Email Address</Label>
                  <Input
                    id="invite_email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Send Invite
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys tab */}
        <TabsContent value="api" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Key</CardTitle>
              <CardDescription>
                Use this key to access the PulseClose API programmatically.
                Keep it secret.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {mockApiKey.slice(0, 12)}{"•".repeat(20)}{mockApiKey.slice(-4)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyKey}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    toast.info(
                      "API key regenerated. All existing integrations will need to be updated.",
                    )
                  }
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Key
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-muted/50 p-4 space-y-3">
                <p className="text-sm">Base URL</p>
                <code className="block rounded bg-muted px-3 py-2 font-mono text-sm">
                  https://api.pulseclose.com/v1
                </code>
                <p className="text-sm mt-3">Example: Create Validation</p>
                <code className="block rounded bg-muted px-3 py-2 font-mono text-xs whitespace-pre">
{`curl -X POST https://api.pulseclose.com/v1/validations \\
  -H "Authorization: Bearer pc_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"borrower_name": "John Smith", ...}'`}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
