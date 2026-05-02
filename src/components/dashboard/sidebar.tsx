"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Shield,
  BarChart3,
  Calculator,
  Briefcase,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Nav reflects the lender's journey, not a menu of modules. The standalone
// single-check pages were deleted in G3.5 — the unified validation flow is
// the canonical path.
const navItems = [
  {
    label: "Validations",
    href: "/dashboard",
    icon: Shield,
    description: "Borrower validations — pipeline view",
  },
  {
    label: "Activity",
    href: "/dashboard/activity",
    icon: Activity,
    description: "Workspace event feed",
  },
  {
    label: "Evaluate Deal",
    href: "/dashboard/evaluate",
    icon: Calculator,
    description: "Match deals to investor criteria",
  },
  {
    label: "Investors",
    href: "/dashboard/evaluate/investors",
    icon: Briefcase,
    description: "Configure investor criteria",
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
  return (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          <span className="text-sidebar-foreground">Pulse</span>
          <span className="text-sidebar-primary">Close</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
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

      // Try to fetch org name — use admin-safe API route instead of direct RLS query
      let orgName = "";
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          orgName = data.org?.name ?? "";
        }
      } catch {
        // Org name is cosmetic — don't fail the sidebar
      }

      setUserInfo({
        full_name: displayName,
        email: user.email ?? "",
        org_name: orgName,
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
