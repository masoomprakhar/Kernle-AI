"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AcceptForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { loginWithTokens } = useAuth();
  const [token, setToken] = useState(params.get("token") || "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{
        accessToken?: string;
        refreshToken?: string;
        memberships?: never[];
        workspaces?: never[];
      }>("/invites/accept", {
        method: "POST",
        auth: false,
        body: { token, name, password },
      });
      if (res.accessToken && res.refreshToken) {
        await loginWithTokens(res.accessToken, res.refreshToken, res.memberships, res.workspaces);
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite accept failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-fade-in shadow-none">
      <CardHeader>
        <CardTitle>Accept invite</CardTitle>
        <CardDescription>Join your team&apos;s Kernle organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="token">Invite token</Label>
            <Input id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Joining…" : "Join organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptForm />
    </Suspense>
  );
}
