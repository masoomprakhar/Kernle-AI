"use client";

import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Topbar() {
  const { user, workspaceId, orgId, selectWorkspace, selectOrg, logout } = useAuth();
  const router = useRouter();
  const workspaces = user?.workspaces.filter((w) => w.organizationId === orgId) || [];
  const memberships = user?.memberships || [];

  return (
    <header className="flex h-16 items-center gap-3 border-b border-hairline bg-canvas px-5">
      <div className="hidden w-52 md:block">
        <Select
          value={workspaceId || undefined}
          onValueChange={(v) => {
            selectWorkspace(v);
            router.refresh();
          }}
        >
          <SelectTrigger className="h-11 rounded-sm border-hairline">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
            {!workspaces.length && (
              <SelectItem value="none" disabled>
                No workspaces
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search products, SKUs, assets…" disabled />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="icon" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="max-w-[180px] truncate py-2">
              {user?.name || user?.email || "Account"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-hairline">
            <DropdownMenuLabel>
              <div className="truncate font-medium text-ink">{user?.name}</div>
              <div className="truncate text-xs font-normal text-muted">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {memberships.length > 1 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted">Organizations</DropdownMenuLabel>
                {memberships.map((m) => (
                  <DropdownMenuItem
                    key={m.organizationId}
                    onClick={() => {
                      selectOrg(m.organizationId);
                      router.refresh();
                    }}
                  >
                    {m.organizationName}
                    {m.organizationId === orgId ? " ✓" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
