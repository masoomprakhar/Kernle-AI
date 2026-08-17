"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_EMAIL = "owner@kernle.local";
const DEMO_PASSWORD = "demo1234";

export function HomeAuthModal() {
  const router = useRouter();
  const { user, loading: authLoading, loginWithTokens } = useAuth();
  const [open, setOpen] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 3000);
    return () => window.clearTimeout(timer);
  }, [authLoading, user]);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        memberships: { organizationId: string; onboardingDone: boolean }[];
        workspaces?: { id: string; organizationId: string; name: string }[];
      }>("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      const nextUser = await loginWithTokens(
        res.accessToken,
        res.refreshToken,
        res.memberships as never,
        res.workspaces,
      );
      const membership = nextUser?.memberships[0];
      if (!membership || !membership.onboardingDone) router.push("/onboarding");
      else router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{
        accessToken?: string;
        refreshToken?: string;
        memberships?: { organizationId: string; onboardingDone: boolean }[];
        workspaces?: { id: string; organizationId: string; name: string }[];
      }>("/auth/signup", {
        method: "POST",
        auth: false,
        body: { email, password, name: name || email.split("@")[0] },
      });
      if (res.accessToken && res.refreshToken) {
        await loginWithTokens(
          res.accessToken,
          res.refreshToken,
          res.memberships as never,
          res.workspaces,
        );
        router.push("/verify-email");
      } else {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[min(92dvh,640px)] w-[min(100vw-1.5rem,320px)] gap-0 overflow-y-auto rounded-2xl border border-hairline bg-canvas p-0 shadow-[0_8px_40px_rgba(24,29,38,0.12)] sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">
          {showSignup ? "Sign up" : "Try the Kernle demo"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Demo sign in with pre-filled credentials, or create an account.
        </DialogDescription>

        <div className="flex min-h-[280px] flex-col justify-between p-4 sm:p-5">
          <div className="space-y-3 text-center">
            <div className="flex justify-center pt-1">
              <BrandLogo size="md" priority />
            </div>
            <p className="font-display text-[12px] leading-snug tracking-[-0.02em] text-ink">
              Want to try our Demo??
            </p>
          </div>

          {!showSignup ? (
            <form className="space-y-3" onSubmit={onSignIn}>
              <div className="space-y-2 text-left">
                <div className="space-y-1">
                  <Label htmlFor="demo-email" className="text-[11px] text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="demo-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 rounded-md border-hairline bg-surface-soft/50 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="demo-password" className="text-[11px] text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="demo-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 rounded-md border-hairline bg-surface-soft/50 text-[13px]"
                  />
                </div>
              </div>

              {error && <p className="text-left text-[12px] text-destructive">{error}</p>}

              <Button type="submit" className="h-9 w-full rounded-md text-[13px]" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>

              <p className="text-center text-[12px] text-muted-foreground">
                New here?{" "}
                <button
                  type="button"
                  className="font-medium text-link hover:underline"
                  onClick={() => {
                    setShowSignup(true);
                    setError("");
                    setEmail("");
                    setPassword("");
                    setName("");
                  }}
                >
                  Sign up
                </button>
              </p>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={onSignUp}>
              <div className="space-y-2 text-left">
                <div className="space-y-1">
                  <Label htmlFor="signup-name" className="text-[11px] text-muted-foreground">
                    Name
                  </Label>
                  <Input
                    id="signup-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 rounded-md border-hairline bg-surface-soft/50 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-email" className="text-[11px] text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 rounded-md border-hairline bg-surface-soft/50 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-password" className="text-[11px] text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 rounded-md border-hairline bg-surface-soft/50 text-[13px]"
                  />
                </div>
              </div>

              {error && <p className="text-left text-[12px] text-destructive">{error}</p>}

              <Button type="submit" className="h-9 w-full rounded-md text-[13px]" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </Button>

              <p className="text-center text-[12px] text-muted-foreground">
                Have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-link hover:underline"
                  onClick={() => {
                    setShowSignup(false);
                    setError("");
                    setEmail(DEMO_EMAIL);
                    setPassword(DEMO_PASSWORD);
                  }}
                >
                  Sign in
                </button>
                {" · "}
                <Link href="/signup" className="text-link hover:underline">
                  Full page
                </Link>
              </p>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
