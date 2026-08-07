"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { Homepage } from "@/components/marketing/homepage";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "marketing" | "app">("loading");

  useEffect(() => {
    if (getAccessToken()) {
      setMode("app");
      router.replace("/dashboard");
    } else {
      setMode("marketing");
    }
  }, [router]);

  if (mode === "loading" || mode === "app") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-body-md text-muted-foreground">
        Loading Kernle…
      </div>
    );
  }

  return <Homepage />;
}
