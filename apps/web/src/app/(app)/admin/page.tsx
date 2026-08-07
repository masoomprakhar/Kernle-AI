"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OrgRow = {
  id: string;
  name: string;
  slug?: string;
  plan?: string;
  featureFlags?: Record<string, unknown>;
  _count?: { memberships?: number; products?: number };
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [flagsDraft, setFlagsDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!loading && user && !user.isSuperAdmin) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    void (async () => {
      try {
        const data = await api<OrgRow[]>("/admin/orgs");
        setOrgs(Array.isArray(data) ? data : []);
        const drafts: Record<string, string> = {};
        for (const o of Array.isArray(data) ? data : []) {
          drafts[o.id] = JSON.stringify(o.featureFlags || {}, null, 2);
        }
        setFlagsDraft(drafts);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load orgs");
      }
    })();
  }, [user]);

  if (!user?.isSuperAdmin) {
    return <p className="text-sm text-muted-foreground">Super-admin access required.</p>;
  }

  async function impersonate(organizationId: string) {
    setMessage("");
    try {
      const res = await api(`/admin/orgs/${organizationId}/impersonate`, {
        method: "POST",
        body: {},
      });
      setMessage(typeof res === "object" ? JSON.stringify(res) : String(res));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impersonate failed");
    }
  }

  async function saveFlags(organizationId: string) {
    setError("");
    setMessage("");
    try {
      const featureFlags = JSON.parse(flagsDraft[organizationId] || "{}");
      await api(`/admin/orgs/${organizationId}/feature-flags`, {
        method: "PATCH",
        body: { featureFlags },
      });
      setMessage(`Updated flags for ${organizationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flag update failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin</h1>
        <p className="text-muted-foreground">Super-admin organization controls.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <div className="space-y-3">
        {orgs.map((o) => (
          <Card key={o.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
              <div>
                <CardTitle className="font-sans text-base">{o.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {o.slug} · {o.plan || "Starter"} · members {o._count?.memberships ?? "—"} · products{" "}
                  {o._count?.products ?? "—"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void impersonate(o.id)}>
                Impersonate note
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                className="font-mono text-xs"
                value={flagsDraft[o.id] || "{}"}
                onChange={(e) => setFlagsDraft((d) => ({ ...d, [o.id]: e.target.value }))}
              />
              <Button size="sm" onClick={() => void saveFlags(o.id)}>
                Save feature flags
              </Button>
            </CardContent>
          </Card>
        ))}
        {!orgs.length && <p className="text-sm text-muted-foreground">No organizations found.</p>}
      </div>
    </div>
  );
}
