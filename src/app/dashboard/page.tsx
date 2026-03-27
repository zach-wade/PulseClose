import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

// Placeholder stats — will be replaced with real data from Supabase
const stats = [
  { label: "Total Validations", value: "0", icon: Shield, color: "text-primary" },
  { label: "Verified", value: "0", icon: CheckCircle2, color: "text-success" },
  { label: "Flagged", value: "0", icon: AlertTriangle, color: "text-warning" },
  { label: "Pending", value: "0", icon: Clock, color: "text-muted-foreground" },
];

export default function DashboardPage() {
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
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
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
    </div>
  );
}
