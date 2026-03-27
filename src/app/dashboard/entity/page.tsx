import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search } from "lucide-react";

export default function EntitySearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entity Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Secretary of State lookups, entity status, and ownership verification
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Entity search coming soon</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Search SOS records across all 50 states. Check entity status,
            formation dates, registered agents, and annual filing compliance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
