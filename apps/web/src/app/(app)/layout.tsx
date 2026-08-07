"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { AskKernleWidget } from "@/components/ask-kernle-widget";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-canvas p-6 md:p-8">{children}</main>
      </div>
      <AskKernleWidget />
    </div>
  );
}
