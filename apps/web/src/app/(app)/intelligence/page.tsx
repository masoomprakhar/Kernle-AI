"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  FileStack,
  ListChecks,
  PackagePlus,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Overview = {
  periodDays: number;
  productsFromSource: number;
  sourcesIngested: number;
  pendingSuggestions: number;
  findings: { outstanding: number; resolvedInPeriod: number };
  avgSourceToAcceptMs: number | null;
  avgSourceToAcceptSampleSize: number;
  accuracy: {
    sampleSize: number;
    byAttribute: Array<{
      attributeCode: string;
      attributeType: string;
      total: number;
      acceptedAsIsRate: number;
      editedAcceptRate: number;
      rejectedRate: number;
      summary: string;
    }>;
  };
  pendingByExplanation: Array<{ key: string; count: number; label: string }>;
};

function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default function IntelligencePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Overview>("/ai/insights/overview?days=30")
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load overview"));
  }, []);

  return (
    <div className="mx-auto max-w-content space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md text-ink">Product Intelligence</h1>
          <p className="mt-1 text-body-md text-muted-foreground">
            From scattered sources to Accept-gated, explainable catalog data — one pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/products/new/from-source">
              <PackagePlus className="h-4 w-4" />
              New from source
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/intelligence/unilog">Industrial enrichment</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/ai">Review queue</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-hairline bg-canvas px-4 py-3">
        <p className="text-sm font-medium text-ink">Industrial enrichment demo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Abbreviated distributor rows → brand/UOM normalize, LOV-checked attributes, channel
          descriptions — still Accept-gated before live values.
        </p>
        <Button asChild size="sm" className="mt-3" variant="outline">
          <Link href="/intelligence/unilog">Open guided demo</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 md:grid-cols-5">
        {[
          { n: "01", t: "Sources", d: "URL, PDF, paste" },
          { n: "02", t: "Extract", d: "Structured proposals" },
          { n: "03", t: "Reconcile", d: "Conflicts & consistency" },
          { n: "04", t: "Explain", d: "Self-check + why" },
          { n: "05", t: "Accept", d: "Human gate → live" },
        ].map((s) => (
          <div key={s.n} className="rounded-md border border-hairline bg-canvas px-3 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">{s.n}</p>
            <p className="mt-1 text-sm font-medium text-ink">{s.t}</p>
            <p className="text-xs text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="From source"
          value={String(overview?.productsFromSource ?? "—")}
          hint={`Last ${overview?.periodDays ?? 30} days`}
          icon={<FileStack className="h-4 w-4" />}
        />
        <Stat
          title="Source → Accept"
          value={formatDuration(overview?.avgSourceToAcceptMs ?? null)}
          hint={
            overview?.avgSourceToAcceptSampleSize
              ? `Avg across ${overview.avgSourceToAcceptSampleSize} products`
              : "No accepts in period yet"
          }
          icon={<Clock3 className="h-4 w-4" />}
        />
        <Stat
          title="Findings"
          value={`${overview?.findings.outstanding ?? "—"}`}
          hint={`${overview?.findings.resolvedInPeriod ?? 0} resolved in period`}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <Stat
          title="Pending review"
          value={String(overview?.pendingSuggestions ?? "—")}
          hint={`${overview?.sourcesIngested ?? 0} sources ingested`}
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Accuracy by attribute</CardTitle>
              <CardDescription>
                Accept / edit / reject rates (Phase 3 calibration, read-only).
              </CardDescription>
            </div>
            <Link href="/ai" className="inline-flex items-center gap-1 text-sm font-medium text-link">
              AI Insights <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.accuracy.byAttribute || []).slice(0, 6).map((row) => (
              <div key={row.attributeCode} className="rounded-md border border-hairline p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{row.attributeCode}</p>
                  <Badge variant="outline">{row.attributeType}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  as-is {formatPercent(row.acceptedAsIsRate * 100)} · edited{" "}
                  {formatPercent(row.editedAcceptRate * 100)} · rejected{" "}
                  {formatPercent(row.rejectedRate * 100)} · n={row.total}
                </p>
              </div>
            ))}
            {!overview?.accuracy.byAttribute?.length && (
              <p className="text-sm text-muted-foreground">
                No resolved suggestions yet — run a from-source flow and Accept a few fields.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue triage</CardTitle>
            <CardDescription>Pending suggestions grouped by explanation type.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.pendingByExplanation || []).map((g) => (
              <div
                key={g.key}
                className="flex items-center justify-between rounded-md border border-hairline px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink">{g.label || g.key}</span>
                <Badge variant="secondary">{g.count}</Badge>
              </div>
            ))}
            {!overview?.pendingByExplanation?.length && (
              <p className="text-sm text-muted-foreground">Review queue is clear.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" asChild>
                <Link href="/products/new/from-source">Start workflow</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/ai">Open full queue</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
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
        <CardTitle className="font-sans text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
