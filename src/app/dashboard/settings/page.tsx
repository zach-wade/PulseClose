import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Organization, team, and integration configuration
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Settings className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Settings coming soon</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Configure your organization, manage team members, set up API keys,
            and customize validation parameters.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
