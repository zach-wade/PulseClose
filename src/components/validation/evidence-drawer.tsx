// Evidence drawer — drill to source evidence in a side panel, NOT below the
// fold (UX-REDESIGN §11.2 principle 10; "can't trust the output without the
// inputs"). Thin wrapper over the base-ui Sheet so every "view evidence →"
// across the product opens the same right-side drawer.

"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function EvidenceDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
