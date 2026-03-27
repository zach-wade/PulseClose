import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function TrackRecordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Track Record</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Borrower project history, experience tiers, and property transaction
          verification
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Track record search coming soon</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Verify borrower property transactions, calculate experience tiers,
            and assess project outcomes across county records and deed
            transfers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
