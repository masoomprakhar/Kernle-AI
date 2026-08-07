"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Org = { id: string; name: string; slug?: string; plan?: string; industry?: string };
type Member = {
  id: string;
  user?: { id: string; name?: string; email?: string };
  role?: { name?: string };
};
type Invite = { id: string; email: string; roleName?: string; createdAt?: string };
type Usage = {
  plan?: string;
  skus?: { used?: number; limit?: number };
  aiTokens?: { used?: number; limit?: number };
  assets?: { used?: number; limit?: number };
  seats?: { used?: number; limit?: number };
};

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Contributor");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const [o, m, i, u] = await Promise.all([
        api<Org>("/orgs/current"),
        api<Member[]>("/orgs/members").catch(() => []),
        api<Invite[]>("/invites").catch(() => []),
        api<Usage>("/billing/usage").catch(() => null),
      ]);
      setOrg(o);
      setMembers(Array.isArray(m) ? m : []);
      setInvites(Array.isArray(i) ? i : []);
      setUsage(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function sendInvite() {
    setError("");
    setMessage("");
    try {
      await api("/invites", {
        method: "POST",
        body: { email: inviteEmail, roleName: inviteRole },
      });
      setInviteEmail("");
      setMessage("Invite sent");
      await load();
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    }
  }

  async function checkout(plan: "Growth" | "Enterprise") {
    try {
      const res = await api<{ url?: string }>("/billing/checkout", {
        method: "POST",
        body: { plan },
      });
      if (res.url) window.location.href = res.url;
      else setMessage("Checkout session created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    }
  }

  function bar(used?: number, limit?: number) {
    if (!limit) return 0;
    return Math.min(100, Math.round(((used || 0) / limit) * 100));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Organization, people, billing, and appearance.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">Organization</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="theme">Theme</TabsTrigger>
        </TabsList>

        <TabsContent value="org">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Organization</CardTitle>
              <CardDescription>Signed in as {user?.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b py-2">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{org?.name || "—"}</span>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-medium">{org?.slug || "—"}</span>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{org?.plan || usage?.plan || "Starter"}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Industry</span>
                <span className="font-medium">{org?.industry || "—"}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Invite teammate</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input
                className="min-w-[200px] flex-1"
                type="email"
                placeholder="email@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Admin", "CatalogManager", "Contributor", "Viewer"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void sendInvite()} disabled={!inviteEmail}>
                Send invite
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex justify-between text-sm">
                  <span>
                    {m.user?.name || m.user?.email}{" "}
                    <span className="text-muted-foreground">{m.user?.email}</span>
                  </span>
                  <span className="text-muted-foreground">{m.role?.name}</span>
                </div>
              ))}
              {!members.length && (
                <p className="text-sm text-muted-foreground">Member list requires Admin access.</p>
              )}
            </CardContent>
          </Card>

          {!!invites.length && (
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base">Pending invites</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {invites.map((i) => (
                  <div key={i.id} className="flex justify-between">
                    <span>{i.email}</span>
                    <span className="text-muted-foreground">{i.roleName}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Usage</CardTitle>
              <CardDescription>Plan limits for the current organization.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                ["SKUs", usage?.skus],
                ["AI tokens", usage?.aiTokens],
                ["Assets", usage?.assets],
                ["Seats", usage?.seats],
              ].map(([label, metric]) => {
                const m = metric as { used?: number; limit?: number } | undefined;
                return (
                  <div key={String(label)}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{label as string}</span>
                      <span className="text-muted-foreground">
                        {m?.used ?? 0} / {m?.limit ?? "∞"}
                      </span>
                    </div>
                    <Progress value={bar(m?.used, m?.limit)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button onClick={() => void checkout("Growth")}>Upgrade to Growth</Button>
            <Button variant="outline" onClick={() => void checkout("Enterprise")}>
              Enterprise checkout
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Appearance</CardTitle>
              <CardDescription>Kernle supports light and dark themes via next-themes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label>Theme</Label>
              <Select value={theme || "system"} onValueChange={setTheme}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
