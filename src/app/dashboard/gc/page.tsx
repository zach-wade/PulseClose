import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { HardHat } from "lucide-react";

export default function GCValidationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GC Validation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          General contractor license, insurance, and permit verification
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">GC validation coming soon</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Look up contractor licenses by state, verify insurance coverage,
            check permit history, and flag related-party relationships.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
