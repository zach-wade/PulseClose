"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users,
  BarChart3,
  Calculator,
  Landmark,
  Activity,
  BookOpen,
  MapPinned,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Job-shaped IA (UX-REDESIGN-PLAN §1 + §10): the nav answers the lender's
// questions — "who am I lending to?" (Borrowers), "size + route this loan?"
// (Deals), "who funds these + what must I meet?" (Capital), "watch the live
// loans?" (Portfolio) — not a menu of modules. The borrower is the durable spine;
// validations, deals, mandates, outcomes, and monitoring hang off it.
const navItems = [
  {
    label: "Borrowers",
    href: "/dashboard",
    icon: Users,
    description: "Who am I lending to? — the borrower spine + validation pipeline",
  },
  {
    label: "Deals",
    href: "/dashboard/evaluate",
    icon: Calculator,
    description: "Size + route this loan — the Deal analyzer",
  },
  {
    label: "Capital",
    href: "/dashboard/evaluate/investors",
    icon: Landmark,
    description: "Who funds these + what standards must I meet? — investors + mandates",
  },
  {
    label: "Portfolio",
    href: "/dashboard/portfolio",
    icon: BookOpen,
    description: "Watch the live loans — tier mix, outcomes, monitoring",
  },
];

// Fund / capital-provider tenant (org_type=fund): the standard is the product,
// not the origination pipeline. A mandator sets the buy-box + watches throughput
// — it never runs Borrowers or the Deal analyzer. Its spine is Mandates (home,
// the Mandate Console) + Portfolio (the live loans it funds). Borrowers/Deals are
// originator-only and hidden. (UX audit #4 — Fund as a first-class tenant.)
const fundNavItems = [
  {
    label: "Mandates",
    href: "/dashboard/capital/mandates",
    icon: Landmark,
    description: "The standards you set + throughput against them — the Mandate Console",
  },
  {
    label: "Portfolio",
    href: "/dashboard/portfolio",
    icon: BookOpen,
    description: "Watch the live loans — tier mix, outcomes, monitoring",
  },
];

// Secondary utilities — below the spine, visually separated.
const secondaryItems = [
  {
    label: "Coverage",
    href: "/dashboard/coverage",
    icon: MapPinned,
    description: "Where we can validate entity (SOS) + GC license, by state",
  },
  {
    label: "Activity",
    href: "/dashboard/activity",
    icon: Activity,
    description: "Workspace event feed",
  },
  {
    label: "Usage",
    href: "/dashboard/usage",
    icon: BarChart3,
    description: "API usage & billing",
  },
];

interface UserInfo {
  full_name: string;
  email: string;
  org_name: string;
  org_type: string | null;
}

function NavContent({
  pathname,
  userInfo,
  onSignOut,
}: {
  pathname: string;
  userInfo: UserInfo | null;
  onSignOut: () => void;
}) {
  // Fund tenants get the mandator spine; everyone else the originator spine.
  const primaryItems = userInfo?.org_type === "fund" ? fundNavItems : navItems;
  return (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            className="h-7 w-7 shrink-0"
            aria-hidden="true"
          >
            <rect width="64" height="64" rx="14" fill="currentColor" className="text-sidebar-primary/15" />
            <path
              d="M 8 36 L 22 36 L 26 36 L 30 16 L 34 50 L 40 26 L 44 36 L 56 36"
              fill="none"
              stroke="currentColor"
              className="text-sidebar-primary"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            <span className="text-sidebar-foreground">Pulse</span>
            <span className="text-sidebar-primary">Close</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {primaryItems.map((item) => {
          // Deals lives at /dashboard/evaluate but Capital is /dashboard/evaluate/
          // investors — guard so Capital doesn't also light up Deals.
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(item.href) &&
              !(item.href === "/dashboard/evaluate" && pathname.startsWith("/dashboard/evaluate/investors")));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="my-2 border-t border-sidebar-border/60" />

        {secondaryItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User context + bottom */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        {userInfo && (
          <div className="px-3 py-2 mb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-primary">
                {userInfo.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {userInfo.full_name}
                </p>
                <p className="text-xs text-sidebar-foreground/50 truncate">
                  {userInfo.org_name}
                </p>
              </div>
            </div>
          </div>
        )}
        <Link
          href="/dashboard/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/dashboard/settings")
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Use auth metadata first (always available, no RLS issues)
      const meta = user.user_metadata ?? {};
      const displayName = meta.full_name || user.email?.split("@")[0] || "User";

      // Try to fetch org name + type — use admin-safe API route instead of direct
      // RLS query. org_type drives which nav spine renders (fund vs originator).
      let orgName = "";
      let orgType: string | null = null;
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          orgName = data.org?.name ?? "";
          orgType = data.org?.org_type ?? null;
        }
      } catch {
        // Org name is cosmetic — don't fail the sidebar
      }

      setUserInfo({
        full_name: displayName,
        email: user.email ?? "",
        org_name: orgName,
        org_type: orgType,
      });
    }
    loadUser();
  }, []);

  // Derive mobileOpen=false when pathname changes (no effect needed)
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (mobileOpen) {
      setMobileOpen(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 rounded-md bg-sidebar p-2 text-sidebar-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <NavContent
          pathname={pathname}
          userInfo={userInfo}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground"
        data-sidebar
      >
        <NavContent
          pathname={pathname}
          userInfo={userInfo}
          onSignOut={handleSignOut}
        />
      </aside>
    </>
  );
}
