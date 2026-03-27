import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Scale } from "lucide-react";

export default function LitigationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Litigation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bankruptcy, foreclosure, lawsuit, and lien screening
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Litigation search coming soon</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Search PACER for bankruptcies, county records for foreclosures and
            lis pendens, and state courts for active litigation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
