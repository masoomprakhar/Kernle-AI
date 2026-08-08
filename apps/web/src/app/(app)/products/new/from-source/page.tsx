"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileUp, Link2, Sparkles, Type } from "lucide-react";
import { api } from "@/lib/api";
import { formatPercent, labelOf } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Family = { id: string; code: string; label?: unknown };

type SourceDoc = {
  id: string;
  type: string;
  status: string;
  filename?: string | null;
  rawContent?: string | null;
  errorMessage?: string | null;
};

type Suggestion = {
  id: string;
  attributeCode?: string | null;
  suggestedValue?: unknown;
  confidence?: string;
  confidenceScore?: number | null;
  source?: string;
  explanation?: {
    reason?: string;
    excerpt?: string;
    originLabel?: string;
    explanationType?: string;
    notFound?: boolean;
    conflict?: boolean;
    needsAttention?: boolean;
    selfCheckFailures?: Array<{ rule: string; message: string }>;
  } | null;
};

type ProductSummary = {
  id: string;
  sku: string;
  completeness?: Record<string, number>;
  geoScore?: number;
};

const STEPS = [
  { id: "setup", label: "Setup" },
  { id: "sources", label: "Sources" },
  { id: "extract", label: "Extract" },
  { id: "review", label: "Review" },
  { id: "done", label: "Live" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function previewValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value && "not_found_in_source" in (value as object)) {
    return "not found in source";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export default function ProductFromSourcePage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState("");
  const [sku, setSku] = useState("");
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [url, setUrl] = useState("https://example.com/products/air-runner-pro");
  const [paste, setPaste] = useState(
    "Name: Air Runner Pro\nColor: Trail Blue\nMaterial: Mesh + EVA\nPrice: 129\n\nLightweight trail shoe for mixed terrain.",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<StepId>("setup");
  const [productId, setProductId] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);

  useEffect(() => {
    api<Family[]>("/pim/families")
      .then((f) => {
        setFamilies(f || []);
        if (f?.[0]) setFamilyId(f[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load families"));
  }, []);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const completeness = useMemo(() => {
    const vals = Object.values(product?.completeness || {});
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [product]);

  const triage = useMemo(() => {
    let conflicts = 0;
    let needsAttention = 0;
    let notFound = 0;
    for (const s of suggestions) {
      if (s.explanation?.conflict) conflicts += 1;
      if (s.explanation?.needsAttention) needsAttention += 1;
      if (
        s.explanation?.notFound ||
        (s.suggestedValue &&
          typeof s.suggestedValue === "object" &&
          "not_found_in_source" in (s.suggestedValue as object))
      ) {
        notFound += 1;
      }
    }
    return { conflicts, needsAttention, notFound, pending: suggestions.length };
  }, [suggestions]);

  async function refreshReview(pid: string) {
    const [sugs, prod] = await Promise.all([
      api<Suggestion[]>(`/ai/suggestions?status=pending&productId=${pid}`),
      api<ProductSummary>(`/pim/products/${pid}`),
    ]);
    setSuggestions(Array.isArray(sugs) ? sugs : []);
    setProduct(prod);
  }

  async function addUrl() {
    setError("");
    setBusy(true);
    try {
      const doc = await api<SourceDoc>("/ai/sources", {
        method: "POST",
        body: { type: "url", url },
      });
      setSources((s) => [...s, doc]);
      setStep("sources");
      if (doc.status === "failed") setError(doc.errorMessage || "URL fetch failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "URL source failed");
    } finally {
      setBusy(false);
    }
  }

  async function addPaste() {
    setError("");
    setBusy(true);
    try {
      const doc = await api<SourceDoc>("/ai/sources", {
        method: "POST",
        body: { type: "text_paste", text: paste },
      });
      setSources((s) => [...s, doc]);
      setStep("sources");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Text source failed");
    } finally {
      setBusy(false);
    }
  }

  async function addFile(file: File | null) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const doc = await api<SourceDoc>("/ai/sources/upload", { method: "POST", formData: fd });
      setSources((s) => [...s, doc]);
      setStep("sources");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function runExtract() {
    if (!familyId) {
      setError("Pick a family first");
      return;
    }
    if (!sources.length) {
      setError("Add at least one source");
      return;
    }
    setError("");
    setBusy(true);
    setStep("extract");
    try {
      const result = await api<{ productId: string; correlationId?: string }>("/ai/extract", {
        method: "POST",
        body: {
          familyId,
          sourceDocumentIds: sources.map((s) => s.id),
          sku: sku.trim() || undefined,
        },
      });
      setProductId(result.productId);
      setCorrelationId(result.correlationId || null);
      await refreshReview(result.productId);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setStep("sources");
    } finally {
      setBusy(false);
    }
  }

  async function resolveSuggestion(id: string, action: "accept" | "reject") {
    if (!productId) return;
    setResolvingId(id);
    setError("");
    try {
      await api(`/ai/suggestions/${id}/${action}`, { method: "POST" });
      await refreshReview(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setResolvingId(null);
    }
  }

  async function finishLive() {
    if (!productId) return;
    setBusy(true);
    try {
      await refreshReview(productId);
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/intelligence"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Product Intelligence
        </Link>
        <h1 className="font-display text-3xl font-semibold">Product from source</h1>
        <p className="text-muted-foreground">
          One guided path: sources → extract → conflicts & explanations → Accept → catalog-ready.
          Nothing writes to live values until you Accept.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const done = i < stepIndex;
          return (
            <li
              key={s.id}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                active
                  ? "border-ink bg-ink text-white"
                  : done
                    ? "border-border bg-surface-soft text-foreground"
                    : "border-border text-muted-foreground"
              }`}
            >
              {i + 1}. {s.label}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {(step === "setup" || step === "sources") && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Family & SKU</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Family</Label>
                <Select value={familyId} onValueChange={setFamilyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select family" />
                  </SelectTrigger>
                  <SelectContent>
                    {families.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {labelOf(f.label) || f.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SKU (optional)</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="inline-flex items-center gap-2">
                  <Link2 className="h-4 w-4" /> Manufacturer URL
                </Label>
                <div className="flex gap-2">
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} />
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void addUrl()}>
                    Add URL
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="inline-flex items-center gap-2">
                  <Type className="h-4 w-4" /> Paste text
                </Label>
                <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} />
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void addPaste()}>
                  Add text
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="inline-flex items-center gap-2">
                  <FileUp className="h-4 w-4" /> Spec sheet (PDF) or image
                </Label>
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  disabled={busy}
                  onChange={(e) => void addFile(e.target.files?.[0] || null)}
                />
              </div>

              {sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Attached sources</p>
                  <ul className="space-y-2">
                    {sources.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <Badge variant="outline">{s.type}</Badge>
                        <Badge variant={s.status === "parsed" ? "secondary" : "danger"}>
                          {s.status}
                        </Badge>
                        <span className="truncate text-muted-foreground">
                          {s.filename || (s.rawContent || "").slice(0, 80)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/products">Cancel</Link>
            </Button>
            <Button disabled={busy || !sources.length || !familyId} onClick={() => void runExtract()}>
              <Sparkles className="h-4 w-4" />
              Run extraction
            </Button>
          </div>
        </>
      )}

      {step === "extract" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5 animate-pulse text-ink" />
            Extracting structured attributes, running self-check, and surfacing conflicts…
          </CardContent>
        </Card>
      )}

      {step === "review" && productId && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">3. Review & Accept</CardTitle>
              <p className="text-sm text-muted-foreground">
                Conflicts need an explicit choice. Needs-attention rows failed a catalog rule but
                are still shown.{" "}
                {correlationId ? (
                  <span className="font-mono text-xs">corr {correlationId.slice(0, 8)}</span>
                ) : null}
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{triage.pending} pending</Badge>
              {triage.conflicts > 0 && <Badge variant="warning">{triage.conflicts} conflicts</Badge>}
              {triage.needsAttention > 0 && (
                <Badge variant="warning">{triage.needsAttention} needs attention</Badge>
              )}
              {triage.notFound > 0 && <Badge variant="outline">{triage.notFound} not found</Badge>}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {!suggestions.length && (
              <p className="text-sm text-muted-foreground">
                No pending suggestions — accept complete, or extraction found nothing to propose.
              </p>
            )}
            {suggestions.map((s) => {
              const notFound = Boolean(
                s.explanation?.notFound ||
                  (s.suggestedValue &&
                    typeof s.suggestedValue === "object" &&
                    "not_found_in_source" in (s.suggestedValue as object)),
              );
              const isConflict = Boolean(s.explanation?.conflict);
              const needsAttention = Boolean(s.explanation?.needsAttention);
              return (
                <div
                  key={s.id}
                  className={`flex flex-col gap-2 rounded-md border bg-background px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
                    isConflict || needsAttention ? "border-amber-300" : "border-border"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.attributeCode}</span>
                      <Badge variant="outline">{s.confidence || "—"}</Badge>
                      {s.source && <Badge variant="secondary">{s.source}</Badge>}
                      {isConflict && <Badge variant="outline">conflict — pick one</Badge>}
                      {needsAttention && <Badge variant="warning">Needs attention</Badge>}
                      {notFound && <Badge variant="danger">not found</Badge>}
                    </div>
                    <p className="break-words text-sm text-muted-foreground">
                      {previewValue(s.suggestedValue)}
                    </p>
                    {(s.explanation?.reason || s.explanation?.selfCheckFailures?.length) && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium text-foreground">
                          Why this suggestion?
                        </summary>
                        <div className="mt-1 space-y-1">
                          {s.explanation?.originLabel && <p>Origin: {s.explanation.originLabel}</p>}
                          {s.explanation?.reason && <p>{s.explanation.reason}</p>}
                          {s.explanation?.excerpt && (
                            <p className="italic">“{s.explanation.excerpt}”</p>
                          )}
                          {s.explanation?.selfCheckFailures?.map((f) => (
                            <p key={f.rule} className="text-amber-800">
                              {f.rule}: {f.message}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={resolvingId === s.id || notFound}
                      onClick={() => void resolveSuggestion(s.id, "accept")}
                    >
                      {isConflict ? "Choose this" : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolvingId === s.id}
                      onClick={() => void resolveSuggestion(s.id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" asChild>
              <Link href={`/products/${productId}`}>Open product editor</Link>
            </Button>
            <Button disabled={busy} onClick={() => void finishLive()}>
              {suggestions.length ? "Finish with remaining pending" : "Mark catalog-ready"}
            </Button>
          </div>
        </>
      )}

      {step === "done" && productId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Product is in the catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Completeness and GEO update as you Accept. Remaining pending suggestions stay in the
              review queue until you clear them.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">SKU</p>
                <p className="font-medium">{product?.sku || "—"}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Completeness</p>
                <p className="font-medium">{formatPercent(completeness)}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Pending left</p>
                <p className="font-medium">{suggestions.length}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/products/${productId}`}>View product</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/intelligence">Intelligence dashboard</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/ai">AI Insights queue</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
