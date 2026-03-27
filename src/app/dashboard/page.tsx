"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface Validation {
  id: string;
  borrower_name: string;
  borrower_entity_name: string;
  overall_status: string;
  confidence_score: number;
  experience_tier: number | null;
  validation_date: string | null;
  created_at: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }
> = {
  verified: { label: "Verified", variant: "default", icon: CheckCircle2 },
  partial: { label: "Partial", variant: "secondary", icon: Clock },
  flagged: { label: "Flagged", variant: "destructive", icon: AlertTriangle },
  pending: { label: "Pending", variant: "outline", icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function DashboardPage() {
  const [validations, setValidations] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/validations");
        if (res.ok) {
          setValidations(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const verified = validations.filter((v) => v.overall_status === "verified").length;
  const flagged = validations.filter((v) => v.overall_status === "flagged").length;
  const pending = validations.filter((v) => v.overall_status === "pending").length;

  const stats = [
    { label: "Total", value: validations.length, icon: Shield, color: "text-primary" },
    { label: "Verified", value: verified, icon: CheckCircle2, color: "text-green-600" },
    { label: "Flagged", value: flagged, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Pending", value: pending, icon: Clock, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Validations</h1>
          <p className="text-muted-foreground mt-1">
            Borrower entity, track record, and credential checks
          </p>
        </div>
        <Button render={<Link href="/dashboard/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New Validation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Validation list or empty state */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      ) : validations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No validations yet</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
              Run your first borrower validation to check entity status, track
              record, contractor credentials, and litigation history.
            </p>
            <Button className="mt-6" render={<Link href="/dashboard/new" />}>
              <Plus className="mr-2 h-4 w-4" />
              Run First Validation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Tier</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validations.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/dashboard/validations/${v.id}`}
                        className="font-medium hover:underline"
                      >
                        {v.borrower_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.borrower_entity_name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.overall_status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {v.confidence_score}%
                    </TableCell>
                    <TableCell className="text-right">
                      {v.experience_tier ? `T${v.experience_tier}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.validation_date
                        ? new Date(v.validation_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" },
                          )
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
