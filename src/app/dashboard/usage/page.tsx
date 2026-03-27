import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage & Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          API usage, validation credits, and cost tracking
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Usage tracking coming soon</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Track validation credits, per-check costs, and API usage across
            your organization. Metering is built in from Day 1.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
