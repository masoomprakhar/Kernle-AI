"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Package, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type ProductList = {
  items: Array<{
    id: string;
    sku: string;
    completeness?: Record<string, number>;
    geoScore?: number;
    enabled?: boolean;
  }>;
  total: number;
};

type Finding = {
  id: string;
  severity?: string;
  message?: string;
  title?: string;
  productId?: string;
  resolved?: boolean;
};

export default function DashboardPage() {
  const [products, setProducts] = useState<ProductList | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [suggestions, setSuggestions] = useState<unknown[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [p, f, s] = await Promise.all([
          api<ProductList>("/pim/products?pageSize=50"),
          api<Finding[]>("/ai/quality/findings?resolved=false").catch(() => []),
          api<unknown[]>("/ai/suggestions?status=pending").catch(() => []),
        ]);
        setProducts(p);
        setFindings(Array.isArray(f) ? f : []);
        setSuggestions(Array.isArray(s) ? s : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
  }, []);

  const avgCompleteness = useMemo(() => {
    const items = products?.items || [];
    if (!items.length) return 0;
    const scores = items.map((p) => {
      const vals = Object.values(p.completeness || {});
      if (!vals.length) return 0;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [products]);

  const enabledCount = products?.items.filter((p) => p.enabled !== false).length ?? 0;

  return (
    <div className="mx-auto max-w-content space-y-8 animate-fade-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md text-ink">Dashboard</h1>
          <p className="mt-1 text-body-md text-muted-foreground">Catalog health at a glance.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/ai">Open AI Insights</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Products"
          value={String(products?.total ?? "—")}
          hint={`${enabledCount} enabled in sample`}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          title="Avg completeness"
          value={formatPercent(avgCompleteness)}
          hint="Across loaded products"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          title="Quality findings"
          value={String(findings.length)}
          hint="Unresolved"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          title="AI suggestions"
          value={String(suggestions.length)}
          hint="Pending review"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Completeness overview</CardTitle>
            <CardDescription>Average fill rate for channel/locale scopes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Catalog average</span>
                <span className="font-medium">{formatPercent(avgCompleteness)}</span>
              </div>
              <Progress value={avgCompleteness} />
            </div>
            <div className="space-y-2">
              {(products?.items || []).slice(0, 6).map((p) => {
                const vals = Object.values(p.completeness || {});
                const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                return (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{p.sku}</span>
                    <span className="text-muted-foreground">{formatPercent(score)}</span>
                  </Link>
                );
              })}
              {!products?.items?.length && (
                <p className="text-sm text-muted-foreground">No products yet — create one to begin.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quality findings</CardTitle>
            <CardDescription>Issues from the latest quality scan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {findings.slice(0, 8).map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{f.title || f.message || "Finding"}</p>
                  {f.message && f.title && (
                    <p className="mt-1 text-xs text-muted-foreground">{f.message}</p>
                  )}
                </div>
                <Badge variant={f.severity === "high" ? "danger" : "warning"}>
                  {f.severity || "info"}
                </Badge>
              </div>
            ))}
            {!findings.length && (
              <p className="text-sm text-muted-foreground">No open findings. Run a scan from AI Insights.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium font-sans">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
