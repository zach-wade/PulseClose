import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { Building2 } from "lucide-react";
import { formatCurrency } from "./shared-types";
import type { TrackRecordEntry } from "./shared-types";

export { type TrackRecordEntry };

export function TrackRecordTable({ data }: { data: TrackRecordEntry[] }) {
  const completedProjects = data.filter((t) => t.outcome === "completed");
  const totalProfit = completedProjects.reduce(
    (sum, t) => sum + (t.profit ?? 0),
    0,
  );
  const avgHold =
    completedProjects.length > 0
      ? Math.round(
          completedProjects.reduce((sum, t) => sum + (t.hold_months ?? 0), 0) /
            completedProjects.length,
        )
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Track Record
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {completedProjects.length} completed, {formatCurrency(totalProfit)}{" "}
            total profit, {avgHold}mo avg hold
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Purchase</TableHead>
              <TableHead className="text-right">Sale</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">Hold</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((tr) => (
              <TableRow key={tr.id}>
                <TableCell className="font-medium max-w-[200px] truncate">
                  {tr.property_address}
                </TableCell>
                <TableCell className="capitalize">{tr.project_type}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(tr.acquisition_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(tr.disposition_price)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono text-sm ${
                    tr.profit && tr.profit > 0
                      ? "text-green-600"
                      : tr.profit && tr.profit < 0
                        ? "text-red-600"
                        : ""
                  }`}
                >
                  {formatCurrency(tr.profit)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {tr.hold_months ?? "—"}mo
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      tr.outcome === "completed"
                        ? "default"
                        : tr.outcome === "in_progress"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {tr.outcome}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
