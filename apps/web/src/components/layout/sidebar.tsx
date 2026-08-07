"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  FolderTree,
  ImageIcon,
  LayoutDashboard,
  Package,
  Radio,
  Settings,
  Shield,
  Shuffle,
  Tags,
  Truck,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/attributes", label: "Attributes", icon: Tags },
  { href: "/families", label: "Families", icon: Layers },
  { href: "/assets", label: "Assets", icon: ImageIcon },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/import-export", label: "Import/Export", icon: Shuffle },
  { href: "/channels", label: "Channels", icon: Radio },
  { href: "/ai", label: "AI Insights", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-canvas">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" className="font-display text-title-sm font-semibold text-ink">
          Kernle AI
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-body-md transition-colors",
                active
                  ? "bg-ink text-white"
                  : "text-body active:bg-surface-soft",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        {user?.isSuperAdmin && (
          <Link
            href="/admin"
            className={cn(
              "mt-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-body-md",
              pathname.startsWith("/admin")
                ? "bg-ink text-white"
                : "text-body active:bg-surface-soft",
            )}
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        )}
      </nav>
    </aside>
  );
}
