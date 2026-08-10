"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  Sparkles,
  Target,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Product = {
  id: string;
  sku: string;
  values?: Record<string, unknown>;
  family?: { id: string; code: string; label?: unknown };
};

type Suggestion = {
  id: string;
  productId?: string | null;
  attributeCode?: string | null;
  suggestedValue?: unknown;
  confidence?: string;
  confidenceScore?: number | null;
  source?: string;
  explanation?: {
    reason?: string;
    excerpt?: string | null;
    needsAttention?: boolean;
    selfCheckFailures?: Array<{ rule: string; message: string }>;
  } | null;
  product?: { id: string; sku: string };
};

type EvalResult = {
  sampleSize: number;
  fieldAccuracy: number;
  fieldsChecked: number;
  fieldsMatched: number;
  lovHitRate: number;
  lovChecked: number;
  charLimitCompliance: number;
  charLimitChecked: number;
  needsReviewCount: number;
  pendingSuggestionCount: number;
  mode: string;
  byField: Array<{ field: string; matched: number; total: number; rate: number }>;
};

const STEPS = [
  { id: "messy", label: "Messy input" },
  { id: "enrich", label: "Enrich" },
  { id: "accept", label: "Accept" },
  { id: "eval", label: "Score" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function flattenPreview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("<all_channels>" in obj) {
      const ch = obj["<all_channels>"] as Record<string, unknown> | undefined;
      const v = ch?.["<all_locales>"];
      if (v != null) return String(v);
    }
    if ("data" in obj) return String(obj.data);
  }
  return JSON.stringify(value);
}

export default function IndustrialEnrichmentDemoPage() {
  const [step, setStep] = useState<StepId>("messy");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [enrichSummary, setEnrichSummary] = useState<{
    productCount: number;
    suggestionCount: number;
    needsAttentionCount: number;
  } | null>(null);

  const loadProducts = useCallback(async () => {
    const res = await api<{ items: Product[] }>("/pim/products?search=UNI-&pageSize=80");
    const rows = res?.items || [];
    const industrial = rows.filter(
      (p) => p.sku?.startsWith("UNI-") || p.family?.code === "faucet" || p.family?.code === "fitting",
    );
    setProducts(industrial.length ? industrial : rows);
    if (!selectedId && (industrial[0] || rows[0])) {
      setSelectedId((industrial[0] || rows[0]).id);
    }
  }, [selectedId]);

  const loadSuggestions = useCallback(async (productId?: string) => {
    const q = productId
      ? `/ai/suggestions?status=pending&productId=${productId}`
      : "/ai/suggestions?status=pending";
    const rows = await api<Suggestion[]>(q).catch(() => []);
    const industrial = (rows || []).filter(
      (s) => s.source === "unilog_enrich" || s.product?.sku?.startsWith("UNI-"),
    );
    setSuggestions(industrial.length ? industrial : rows || []);
  }, []);

  useEffect(() => {
    loadProducts().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load industrial SKUs"),
    );
  }, [loadProducts]);

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) || null,
    [products, selectedId],
  );

  const productSuggestions = useMemo(
    () => suggestions.filter((s) => !selectedId || s.productId === selectedId),
    [suggestions, selectedId],
  );

  const triage = useMemo(() => {
    let needsAttention = 0;
    for (const s of productSuggestions) {
      if (s.explanation?.needsAttention) needsAttention += 1;
    }
    return { total: productSuggestions.length, needsAttention };
  }, [productSuggestions]);

  async function runEnrich(scope: "selected" | "labelled") {
    setBusy(true);
    setError("");
    try {
      const body =
        scope === "selected" && selectedId
          ? { productIds: [selectedId] }
          : {
              skus: [
                "UNI-FCT-001",
                "UNI-FCT-002",
                "UNI-FCT-003",
                "UNI-FCT-004",
                "UNI-FCT-005",
                "UNI-FIT-001",
                "UNI-FIT-002",
                "UNI-FIT-003",
                "UNI-FIT-004",
                "UNI-FIT-005",
              ],
            };
      const res = await api<{
        productCount: number;
        suggestionCount: number;
        needsAttentionCount: number;
      }>("/ai/unilog/enrich", { method: "POST", body });
      setEnrichSummary({
        productCount: res.productCount,
        suggestionCount: res.suggestionCount,
        needsAttentionCount: res.needsAttentionCount,
      });
      await loadSuggestions(selectedId || undefined);
      setStep("accept");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "accept" | "reject") {
    setResolvingId(id);
    setError("");
    try {
      await api(`/ai/suggestions/${id}/${action}`, { method: "POST", body: {} });
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      await loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setResolvingId(null);
    }
  }

  async function acceptAllForSelected() {
    setBusy(true);
    setError("");
    try {
      for (const s of productSuggestions) {
        if (s.explanation?.needsAttention) continue;
        await api(`/ai/suggestions/${s.id}/accept`, { method: "POST", body: {} });
      }
      await loadSuggestions(selectedId);
      await loadProducts();
      setStep("eval");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function runEval() {
    setBusy(true);
    setError("");
    try {
      const res = await api<EvalResult>("/ai/unilog/eval");
      setEvalResult(res);
      setStep("eval");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval failed");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const rawDesc = selected?.values
    ? flattenPreview(selected.values.part_desc_raw) || flattenPreview(selected.values.mpn)
    : "";

  return (
    <div className="mx-auto max-w-content space-y-8 animate-fade-in">
      <div>
        <Link
          href="/intelligence"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Product Intelligence
        </Link>
        <h1 className="mt-2 font-display text-display-md text-ink">Industrial enrichment</h1>
        <p className="mt-1 max-w-2xl text-body-md text-muted-foreground">
          Messy distributor SKUs → classify, normalize, LOV-check, and describe — then Accept before
          anything becomes live catalog data.
        </p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-md border px-3 py-2 text-sm ${
              i <= stepIndex
                ? "border-ink/20 bg-canvas text-ink"
                : "border-hairline text-muted-foreground"
            }`}
          >
            <span className="text-[11px] text-muted-foreground">0{i + 1}</span>
            <p className="font-medium">{s.label}</p>
          </li>
        ))}
      </ol>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Messy sample row</CardTitle>
            <CardDescription>Synthetic faucet &amp; fitting SKUs with abbreviated part descriptions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-xs font-medium text-muted-foreground">SKU</label>
            <select
              className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setStep("messy");
                void loadSuggestions(e.target.value);
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.family?.code || "—"}
                </option>
              ))}
            </select>
            {!products.length && (
              <p className="text-sm text-muted-foreground">
                No industrial SKUs yet. Run <code className="text-xs">pnpm db:seed:unilog</code>.
              </p>
            )}
            {selected && (
              <div className="space-y-2 rounded-md border border-hairline bg-surface-soft p-3 text-sm">
                <Row label="SKU" value={selected.sku} />
                <Row label="MPN" value={flattenPreview(selected.values?.mpn)} />
                <Row label="Part desc" value={rawDesc || "—"} />
                <Row
                  label="Brand (live)"
                  value={flattenPreview(selected.values?.brand) || "(empty / placeholder)"}
                />
                <Row
                  label="Finish (live)"
                  value={flattenPreview(selected.values?.finish) || "(empty)"}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                disabled={busy || !selectedId}
                onClick={() => void runEnrich("selected")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Enrich this SKU
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void runEnrich("labelled")}
              >
                <Sparkles className="h-4 w-4" />
                Enrich labelled set
              </Button>
            </div>
            {enrichSummary && (
              <p className="text-xs text-muted-foreground">
                Last run: {enrichSummary.suggestionCount} suggestions across{" "}
                {enrichSummary.productCount} products · {enrichSummary.needsAttentionCount} need
                attention · never auto-committed
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Accept queue</CardTitle>
              <CardDescription>
                {triage.total} pending · {triage.needsAttention} need attention. AI never writes live
                values until you Accept.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !productSuggestions.length}
                onClick={() => void acceptAllForSelected()}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accept clear
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void runEval()}>
                <Target className="h-3.5 w-3.5" />
                Score vs ground truth
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {productSuggestions.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-hairline p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{s.attributeCode}</p>
                    <Badge variant="outline">{s.confidence || "—"}</Badge>
                    {s.explanation?.needsAttention && (
                      <Badge variant="danger">needs attention</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={resolvingId === s.id}
                      onClick={() => void decide(s.id, "accept")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolvingId === s.id}
                      onClick={() => void decide(s.id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink">{flattenPreview(s.suggestedValue)}</p>
                {s.explanation?.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Why: {s.explanation.reason}
                    {s.explanation.excerpt ? ` · “${s.explanation.excerpt}”` : ""}
                  </p>
                )}
                {!!s.explanation?.selfCheckFailures?.length && (
                  <ul className="mt-1 list-inside list-disc text-xs text-destructive">
                    {s.explanation.selfCheckFailures.map((f) => (
                      <li key={f.rule + f.message}>{f.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {!productSuggestions.length && (
              <p className="text-sm text-muted-foreground">
                No pending industrial suggestions. Run enrich to populate the Accept queue.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {evalResult && (
        <Card>
          <CardHeader>
            <CardTitle>Eval vs ground truth</CardTitle>
            <CardDescription>
              Labelled delivery fields · mode {evalResult.mode} · {evalResult.sampleSize} SKUs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric
                label="Field accuracy"
                value={formatPercent(evalResult.fieldAccuracy * 100)}
                hint={`${evalResult.fieldsMatched}/${evalResult.fieldsChecked}`}
              />
              <Metric
                label="LOV hit rate"
                value={formatPercent(evalResult.lovHitRate * 100)}
                hint={`${evalResult.lovChecked} checked`}
              />
              <Metric
                label="Char-limit OK"
                value={formatPercent(evalResult.charLimitCompliance * 100)}
                hint={`${evalResult.charLimitChecked} descriptions`}
              />
              <Metric
                label="Needs review"
                value={String(evalResult.needsReviewCount)}
                hint={`${evalResult.pendingSuggestionCount} pending`}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {evalResult.byField.slice(0, 9).map((f) => (
                <div key={f.field} className="rounded-md border border-hairline px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{f.field}</span>
                    <span className="text-muted-foreground">{formatPercent(f.rate * 100)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f.matched}/{f.total}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-medium text-ink">{value || "—"}</span>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-hairline p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
