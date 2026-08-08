"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Package,
  Radio,
  Sparkles,
} from "lucide-react";
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
    values?: Record<string, unknown>;
  }>;
  total: number;
};

type Finding = {
  id: string;
  severity?: string;
  message?: string;
  description?: string;
  title?: string;
  productId?: string;
  resolved?: boolean;
};

type Suggestion = {
  id: string;
  attributeCode?: string;
  confidence?: string;
  confidenceScore?: number;
  status?: string;
  productId?: string | null;
  suggestedValue?: unknown;
  product?: { sku?: string } | null;
};

type ChannelDash = {
  channelId: string;
  code: string;
  label: string;
  activationStatus?: string;
  paused?: boolean;
  counts: { in_sync: number; pending: number; error: number };
};

function productName(p: ProductList["items"][0]) {
  const name = p.values?.name;
  if (name && typeof name === "object" && name !== null && "en_US" in name) {
    return String((name as { en_US: string }).en_US);
  }
  if (typeof name === "string") return name;
  return p.sku;
}

export default function DashboardPage() {
  const [products, setProducts] = useState<ProductList | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [channels, setChannels] = useState<ChannelDash[]>([]);
  const [error, setError] = useState("");

  const [intelligence, setIntelligence] = useState<{
    productsFromSource: number;
    pendingSuggestions: number;
    findings: { outstanding: number; resolvedInPeriod: number };
    avgSourceToAcceptMs: number | null;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, f, s, c, intel] = await Promise.all([
          api<ProductList>("/pim/products?pageSize=50"),
          api<Finding[]>("/ai/quality/findings?resolved=false").catch(() => []),
          api<Suggestion[]>("/ai/suggestions?status=pending").catch(() => []),
          api<ChannelDash[]>("/syndication/dashboard").catch(() => []),
          api<{
            productsFromSource: number;
            pendingSuggestions: number;
            findings: { outstanding: number; resolvedInPeriod: number };
            avgSourceToAcceptMs: number | null;
          }>("/ai/insights/overview?days=30").catch(() => null),
        ]);
        setProducts(p);
        setFindings(Array.isArray(f) ? f : []);
        setSuggestions(Array.isArray(s) ? s : []);
        setChannels(Array.isArray(c) ? c : []);
        setIntelligence(intel);
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

  const avgGeo = useMemo(() => {
    const items = products?.items || [];
    if (!items.length) return 0;
    return items.reduce((a, p) => a + (p.geoScore || 0), 0) / items.length;
  }, [products]);

  const enabledCount = products?.items.filter((p) => p.enabled !== false).length ?? 0;
  const syncTotals = useMemo(() => {
    return channels.reduce(
      (acc, ch) => {
        acc.in_sync += ch.counts?.in_sync || 0;
        acc.pending += ch.counts?.pending || 0;
        acc.error += ch.counts?.error || 0;
        return acc;
      },
      { in_sync: 0, pending: 0, error: 0 },
    );
  }, [channels]);

  const activity = useMemo(() => {
    const rows: { label: string; meta: string; tone: "ok" | "warn" | "danger" }[] = [];
    findings.slice(0, 3).forEach((f) => {
      rows.push({
        label: f.title || "Quality finding",
        meta: f.severity || "info",
        tone: f.severity === "high" ? "danger" : "warn",
      });
    });
    suggestions.slice(0, 2).forEach((s) => {
      rows.push({
        label: `AI draft for ${s.attributeCode || "attribute"}`,
        meta: s.confidence || "pending",
        tone: "ok",
      });
    });
    if (syncTotals.error) {
      rows.push({
        label: `${syncTotals.error} channel sync error${syncTotals.error > 1 ? "s" : ""}`,
        meta: "syndication",
        tone: "danger",
      });
    }
    if (!rows.length) {
      rows.push(
        { label: "Catalog seeded with demo apparel SKUs", meta: "catalog", tone: "ok" },
        { label: "Ecommerce channel active", meta: "channels", tone: "ok" },
      );
    }
    return rows.slice(0, 6);
  }, [findings, suggestions, syncTotals.error]);

  return (
    <div className="mx-auto max-w-content space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md text-ink">Dashboard</h1>
          <p className="mt-1 text-body-md text-muted-foreground">
            Catalog health, AI review queue, and channel readiness.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href="/products">View products</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/intelligence">Product Intelligence</Link>
          </Button>
          <Button asChild>
            <Link href="/ai">Open AI Insights</Link>
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {intelligence && (
        <Card className="border-ink/10 bg-surface-soft/50">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Product Intelligence
              </CardTitle>
              <CardDescription>
                Source → extract → reconcile → Accept across the catalog (last 30 days).
              </CardDescription>
            </div>
            <Link
              href="/intelligence"
              className="inline-flex items-center gap-1 text-sm font-medium text-link"
            >
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">From source</p>
              <p className="font-display text-2xl font-semibold">{intelligence.productsFromSource}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending review</p>
              <p className="font-display text-2xl font-semibold">{intelligence.pendingSuggestions}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Findings open</p>
              <p className="font-display text-2xl font-semibold">{intelligence.findings.outstanding}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resolved in period</p>
              <p className="font-display text-2xl font-semibold">
                {intelligence.findings.resolvedInPeriod}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Products"
          value={String(products?.total ?? "—")}
          hint={`${enabledCount} enabled`}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          title="Avg completeness"
          value={formatPercent(avgCompleteness)}
          hint={`GEO score avg ${Math.round(avgGeo)}`}
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
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Completeness overview</CardTitle>
              <CardDescription>Per-SKU fill rate across channel scopes.</CardDescription>
            </div>
            <Link href="/products" className="text-link text-sm font-medium inline-flex items-center gap-1">
              All products <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
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
                    className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-surface-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{productName(p)}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums">{formatPercent(score)}</p>
                      <p className="text-[11px] text-muted-foreground">GEO {p.geoScore ?? 0}</p>
                    </div>
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
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Quality findings</CardTitle>
              <CardDescription>Issues ranked for the team to clear.</CardDescription>
            </div>
            <Link href="/ai" className="text-link text-sm font-medium inline-flex items-center gap-1">
              AI Insights <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {findings.slice(0, 6).map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 rounded-md border border-hairline p-3">
                <div>
                  <p className="text-sm font-medium text-ink">{f.title || f.message || "Finding"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.description || f.message || "Needs review"}
                  </p>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              Channel readiness
            </CardTitle>
            <CardDescription>Syndication status by destination.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {channels.map((ch) => (
              <div key={ch.channelId} className="rounded-md border border-hairline p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{ch.label}</p>
                  <Badge variant={ch.activationStatus === "active" ? "success" : "warning"}>
                    {ch.paused ? "paused" : ch.activationStatus || "draft"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{ch.counts.in_sync} in sync</span>
                  <span>{ch.counts.pending} pending</span>
                  <span className={ch.counts.error ? "text-coral" : ""}>{ch.counts.error} errors</span>
                </div>
              </div>
            ))}
            {!channels.length && (
              <p className="text-sm text-muted-foreground">No channels configured yet.</p>
            )}
            <div className="rounded-md bg-surface-soft px-3 py-2 text-xs text-muted-foreground">
              Totals: {syncTotals.in_sync} synced · {syncTotals.pending} pending · {syncTotals.error}{" "}
              errors
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>AI review queue</CardTitle>
            <CardDescription>Suggestions waiting for a human accept.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.slice(0, 5).map((s) => (
              <div key={s.id} className="rounded-md border border-hairline p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{s.attributeCode || "Field"}</p>
                  <Badge variant="warning">{s.confidence || "review"}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {typeof s.suggestedValue === "string"
                    ? s.suggestedValue
                    : JSON.stringify(s.suggestedValue)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Confidence {s.confidenceScore ?? "—"}
                  {s.product?.sku ? ` · ${s.product.sku}` : ""}
                </p>
              </div>
            ))}
            {!suggestions.length && (
              <p className="text-sm text-muted-foreground">No pending AI suggestions.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>What needs attention right now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex items-start justify-between gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{row.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.meta}</p>
                </div>
                <span
                  className={
                    row.tone === "danger"
                      ? "text-xs font-medium text-coral"
                      : row.tone === "warn"
                        ? "text-xs font-medium text-link"
                        : "text-xs font-medium text-success"
                  }
                >
                  {row.tone === "danger" ? "Action" : row.tone === "warn" ? "Review" : "OK"}
                </span>
              </div>
            ))}
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
