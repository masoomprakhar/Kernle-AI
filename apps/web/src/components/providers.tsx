"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" disableTransitionOnChange>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
