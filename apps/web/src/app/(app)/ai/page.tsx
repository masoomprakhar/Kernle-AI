"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Explanation = {
  reason?: string;
  excerpt?: string | null;
  originLabel?: string;
  explanationType?: string;
  conflict?: boolean;
  conflictGroupId?: string | null;
  notFound?: boolean;
  needsAttention?: boolean;
  selfCheckFailures?: Array<{ rule: string; message: string }>;
  sourceDocumentIds?: string[];
};

type Suggestion = {
  id: string;
  productId?: string | null;
  attributeCode?: string | null;
  suggestedValue?: unknown;
  confidence?: string;
  source?: string;
  explanation?: Explanation | null;
  product?: { id: string; sku: string };
  sourceDocument?: { id: string; type: string; filename?: string | null } | null;
};

type Finding = {
  id: string;
  title?: string;
  description?: string;
  message?: string;
  severity?: string;
  category?: string;
  fixAction?: {
    type?: string;
    productIds?: string[];
    mapping?: Record<string, string>;
    canonical?: string;
  } | null;
};

type Usage = {
  id?: string;
  operation?: string;
  action?: string;
  tokensIn?: number;
  tokensOut?: number;
  tokens?: number;
  createdAt?: string;
};

type AccuracyRow = {
  attributeCode: string;
  attributeType: string;
  total: number;
  summary: string;
  acceptedAsIsRate: number;
  editedAcceptRate: number;
  rejectedRate: number;
};

type Family = { id: string; code: string };

function previewValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value && "not_found_in_source" in (value as object)) {
    return "not found in source";
  }
  if (typeof value === "object" && value) {
    const scoped = value as Record<string, Record<string, string>>;
    const first = Object.values(scoped)[0];
    if (first && typeof first === "object") {
      const v = Object.values(first)[0];
      if (v != null) return String(v);
    }
  }
  return String(value);
}

function WhySuggestion({ exp, sourceDocument }: { exp?: Explanation | null; sourceDocument?: Suggestion["sourceDocument"] }) {
  if (!exp?.reason && !exp?.selfCheckFailures?.length) return null;
  return (
    <details className="mt-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">Why this suggestion?</summary>
      <div className="mt-2 space-y-1 text-muted-foreground">
        {exp.originLabel && <p>Origin: {exp.originLabel}</p>}
        {exp.explanationType && <p>Type: {exp.explanationType}</p>}
        {exp.reason && <p>{exp.reason}</p>}
        {exp.excerpt && <p className="italic">Excerpt: “{exp.excerpt}”</p>}
        {sourceDocument && (
          <p>
            Source: {sourceDocument.type}
            {sourceDocument.filename ? ` · ${sourceDocument.filename}` : ""}
          </p>
        )}
        {exp.selfCheckFailures && exp.selfCheckFailures.length > 0 && (
          <ul className="list-disc pl-4 text-amber-800">
            {exp.selfCheckFailures.map((f) => (
              <li key={f.rule}>
                <span className="font-medium">{f.rule}</span>: {f.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function AiPage() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Array<{ role: string; content: string }>>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyRow[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [batchFamilyId, setBatchFamilyId] = useState("");
  const [batchSummary, setBatchSummary] = useState<Array<{ key: string; count: number; label: string }>>([]);
  const [triageFilter, setTriageFilter] = useState<string>("all");
  const [jobMetrics, setJobMetrics] = useState<{
    totals?: { queued: number; running: number; completed: number; failed: number; rateLimitHits: number };
    queues?: Record<string, { queued: number; running: number; completed: number; failed: number; avgDurationMs: number; rateLimitHits: number }>;
    depthOverTime?: Array<{ ts: number; depth: number }>;
    recent?: Array<{ queueName: string; status: string; correlationId?: string; durationMs?: number; at: number }>;
    limits?: Record<string, number>;
  } | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    try {
      const [s, f, u, acc, fams, metrics] = await Promise.all([
        api<Suggestion[]>("/ai/suggestions?status=pending").catch(() => []),
        api<Finding[]>("/ai/quality/findings?resolved=false").catch(() => []),
        api<Usage[]>("/ai/usage").catch(() => []),
        api<{ byAttribute: AccuracyRow[] }>("/ai/insights/accuracy").catch(() => ({ byAttribute: [] })),
        api<Family[]>("/pim/families").catch(() => []),
        api<NonNullable<typeof jobMetrics>>("/ai/jobs/metrics").catch(() => null),
      ]);
      setSuggestions(Array.isArray(s) ? s : []);
      setFindings(Array.isArray(f) ? f : []);
      setUsage(Array.isArray(u) ? u : []);
      setAccuracy(acc?.byAttribute || []);
      setFamilies(Array.isArray(fams) ? fams : []);
      setJobMetrics(metrics);
      if (fams?.[0] && !batchFamilyId) setBatchFamilyId(fams[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI data");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conflictGroups = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const s of suggestions) {
      const gid = s.explanation?.conflictGroupId;
      if (s.explanation?.conflict && gid) {
        const list = map.get(gid) || [];
        list.push(s);
        map.set(gid, list);
      }
    }
    return map;
  }, [suggestions]);

  const plainSuggestions = useMemo(() => {
    let rows = suggestions.filter(
      (s) => !(s.explanation?.conflict && s.explanation?.conflictGroupId),
    );
    if (triageFilter === "needs_attention") {
      rows = rows.filter((s) => s.explanation?.needsAttention);
    } else if (triageFilter !== "all") {
      rows = rows.filter((s) => s.explanation?.explanationType === triageFilter);
    }
    return rows;
  }, [suggestions, triageFilter]);

  const triageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: suggestions.length, needs_attention: 0 };
    for (const s of suggestions) {
      if (s.explanation?.needsAttention) counts.needs_attention += 1;
      const t = s.explanation?.explanationType || "other";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [suggestions]);

  async function ask() {
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    setChat((c) => [...c, { role: "user", content: text }]);
    setMessage("");
    try {
      const res = await api<{ reply?: string; answer?: string; conversationId?: string; message?: string }>(
        "/ai/ask",
        { method: "POST", body: { message: text, conversationId } },
      );
      if (res.conversationId) setConversationId(res.conversationId);
      setChat((c) => [...c, { role: "assistant", content: res.reply || res.answer || res.message || "—" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "accept" | "reject") {
    setActing(id);
    try {
      await api(`/ai/suggestions/${id}/${action}`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  async function scan() {
    setInfo("");
    try {
      const res = await api<{ findingsCreated?: number }>("/ai/quality/scan", { method: "POST" });
      setInfo(`Quality scan complete — ${res.findingsCreated ?? "?"} findings`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    }
  }

  async function runBatch() {
    if (!batchFamilyId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        suggestionCount: number;
        groups: Array<{ key: string; count: number; label: string }>;
      }>("/ai/fill/batch", {
        method: "POST",
        body: { familyId: batchFamilyId, limit: 10 },
      });
      setBatchSummary(res.groups || []);
      setInfo(`Batch enrichment created ${res.suggestionCount} suggestions`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch failed");
    } finally {
      setBusy(false);
    }
  }

  async function mergeFinding(id: string) {
    setActing(id);
    setError("");
    try {
      const res = await api<{ merged: number }>(`/ai/quality/findings/${id}/merge`, {
        method: "POST",
      });
      setInfo(`Merged ${res.merged} product values to canonical`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">AI Insights</h1>
          <p className="text-muted-foreground">
            Explainable enrichment, self-checked suggestions, and calibration.
          </p>
        </div>
        <Button variant="outline" onClick={() => void scan()}>
          <Sparkles className="h-4 w-4" />
          Run quality scan
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-emerald-700 dark:text-emerald-300">{info}</p>}

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="ask">Ask Kernle</TabsTrigger>
          <TabsTrigger value="queue">Enrichment queue</TabsTrigger>
          <TabsTrigger value="batch">Batch</TabsTrigger>
          <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="insights">Insights feed</TabsTrigger>
          <TabsTrigger value="usage">AI usage</TabsTrigger>
        </TabsList>

        <TabsContent value="ask">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[240px] space-y-3 rounded-lg border bg-muted/30 p-4">
                {!chat.length && (
                  <p className="text-sm text-muted-foreground">
                    Ask about missing attributes, completeness gaps, or enrichment ideas.
                  </p>
                )}
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message Ask Kernle…"
                  className="min-h-[60px]"
                />
                <Button onClick={() => void ask()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["needs_attention", "Needs attention"],
              ["source_extract", "From sources"],
              ["inferred_family", "Inferred"],
              ["source_conflict", "Conflicts"],
              ["fill_stub", "Fill drafts"],
            ].map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={triageFilter === key ? "default" : "outline"}
                onClick={() => setTriageFilter(key)}
              >
                {label}
                {typeof triageCounts[key] === "number" ? ` (${triageCounts[key]})` : ""}
              </Button>
            ))}
          </div>

          {Array.from(conflictGroups.entries()).map(([gid, group]) => (
            <Card key={gid} className="border-amber-300/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Conflict — choose one value for {group[0]?.attributeCode}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sources disagree. Accepting one rejects the other candidates.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.map((s: Suggestion) => (
                  <div
                    key={s.id}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{previewValue(s.suggestedValue)}</p>
                      <Button
                        size="sm"
                        disabled={acting === s.id}
                        onClick={() => void decide(s.id, "accept")}
                      >
                        Choose this
                      </Button>
                    </div>
                    <WhySuggestion exp={s.explanation} sourceDocument={s.sourceDocument} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {plainSuggestions.map((s) => {
            const notFound = Boolean(s.explanation?.notFound);
            const needsAttention = Boolean(s.explanation?.needsAttention);
            return (
              <Card key={s.id} className={needsAttention ? "border-amber-300/80" : undefined}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <p className="font-medium">
                      {s.attributeCode || "Suggestion"}
                      {s.product ? (
                        <>
                          {" · "}
                          <Link href={`/products/${s.product.id}`} className="underline underline-offset-2">
                            {s.product.sku}
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">{previewValue(s.suggestedValue)}</p>
                    <div className="flex flex-wrap gap-2">
                      {s.confidence && <Badge variant="outline">{s.confidence}</Badge>}
                      {s.source && <Badge variant="secondary">{s.source}</Badge>}
                      {needsAttention && <Badge variant="warning">Needs attention</Badge>}
                      {notFound && <Badge variant="danger">not found</Badge>}
                    </div>
                    <WhySuggestion exp={s.explanation} sourceDocument={s.sourceDocument} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={acting === s.id || notFound}
                      onClick={() => void decide(s.id, "accept")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === s.id}
                      onClick={() => void decide(s.id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!suggestions.length && (
            <p className="text-sm text-muted-foreground">No pending suggestions. AI never auto-commits.</p>
          )}
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batch enrichment</CardTitle>
              <p className="text-sm text-muted-foreground">
                Run fill across a family. Results are grouped by explanation type for triage.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>Family</Label>
                <Select value={batchFamilyId} onValueChange={setBatchFamilyId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Family" />
                  </SelectTrigger>
                  <SelectContent>
                    {families.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={busy || !batchFamilyId} onClick={() => void runBatch()}>
                {busy ? "Running…" : "Run batch (up to 10 products)"}
              </Button>
            </CardContent>
          </Card>
          {batchSummary.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {batchSummary.map((g) => (
                <Card key={g.key}>
                  <CardContent className="py-4">
                    <p className="text-2xl font-semibold">{g.count}</p>
                    <p className="text-sm text-muted-foreground">{g.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Queue depth, per-org rate limits, and recent AI jobs (Admin). Correlation ids span extract → validate → suggest.
            </p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
          {jobMetrics?.totals && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ["Queued", jobMetrics.totals.queued],
                  ["Running", jobMetrics.totals.running],
                  ["Completed", jobMetrics.totals.completed],
                  ["Failed", jobMetrics.totals.failed],
                  ["Rate limits", jobMetrics.totals.rateLimitHits],
                ] as const
              ).map(([label, value]) => (
                <Card key={label}>
                  <CardContent className="py-4">
                    <p className="text-2xl font-semibold">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {jobMetrics?.limits && (
            <p className="text-xs text-muted-foreground">
              Org concurrency {jobMetrics.limits.orgConcurrency} · worker {jobMetrics.limits.workerConcurrency} ·
              interactive priority {jobMetrics.limits.interactivePriority} · batch {jobMetrics.limits.batchPriority}
            </p>
          )}
          {jobMetrics?.queues && (
            <div className="space-y-2">
              {Object.entries(jobMetrics.queues).map(([name, row]) => (
                <Card key={name}>
                  <CardContent className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">
                      q {row.queued} · run {row.running} · ok {row.completed} · fail {row.failed} · avg{" "}
                      {row.avgDurationMs}ms
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {jobMetrics?.recent && jobMetrics.recent.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent jobs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {jobMetrics.recent.slice(0, 15).map((j, i) => (
                  <div key={`${j.at}-${i}`} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-1">
                    <span>
                      {j.queueName} · {j.status}
                      {j.correlationId ? ` · ${j.correlationId.slice(0, 8)}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {j.durationMs != null ? `${j.durationMs}ms` : "—"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {!jobMetrics && (
            <p className="text-sm text-muted-foreground">Job metrics require an Admin role.</p>
          )}
        </TabsContent>

        <TabsContent value="accuracy" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Read-only calibration from Accept / Edit-then-Accept / Reject outcomes. Not used for auto-tuning.
          </p>
          {accuracy.map((row) => (
            <Card key={row.attributeCode}>
              <CardContent className="space-y-2 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.attributeCode}</span>
                  <Badge variant="outline">{row.attributeType}</Badge>
                  <span className="text-muted-foreground">{row.total} outcomes</span>
                </div>
                <p className="text-muted-foreground">{row.summary}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>As-is {Math.round(row.acceptedAsIsRate * 100)}%</div>
                  <div>Edited {Math.round(row.editedAcceptRate * 100)}%</div>
                  <div>Rejected {Math.round(row.rejectedRate * 100)}%</div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!accuracy.length && (
            <p className="text-sm text-muted-foreground">
              Accept or reject suggestions to build accuracy history.
            </p>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-3">
          {findings.map((f) => {
            const fix = f.fixAction;
            const compareIds = fix?.type === "compare_products" ? fix.productIds || [] : [];
            const canMerge = fix?.type === "merge_to_canonical";
            return (
              <Card key={f.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-1 flex flex-wrap gap-2">
                      {f.category && <Badge variant="secondary">{f.category}</Badge>}
                      <Badge variant={f.severity === "high" ? "danger" : "outline"}>
                        {f.severity || "info"}
                      </Badge>
                    </div>
                    <p className="font-medium">{f.title || f.message || "Finding"}</p>
                    {(f.description || f.message) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {f.description || f.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canMerge && (
                      <Button
                        size="sm"
                        disabled={acting === f.id}
                        onClick={() => void mergeFinding(f.id)}
                      >
                        Merge to canonical
                      </Button>
                    )}
                    {compareIds.length >= 2 && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/products/compare?ids=${compareIds.join(",")}`}>Compare</Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void api(`/ai/quality/findings/${f.id}/resolve`, { method: "POST" }).then(load)
                      }
                    >
                      Resolve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!findings.length && <p className="text-sm text-muted-foreground">No open findings.</p>}
        </TabsContent>

        <TabsContent value="usage" className="space-y-2">
          {usage.map((u, i) => (
            <Card key={u.id || i}>
              <CardContent className="flex justify-between py-3 text-sm">
                <span>{u.operation || u.action || "call"}</span>
                <span className="text-muted-foreground">
                  {(u.tokensIn ?? 0) + (u.tokensOut ?? 0) || u.tokens || "—"} tokens ·{" "}
                  {formatDate(u.createdAt)}
                </span>
              </CardContent>
            </Card>
          ))}
          {!usage.length && (
            <p className="text-sm text-muted-foreground">Usage appears for Admin roles once AI is used.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
