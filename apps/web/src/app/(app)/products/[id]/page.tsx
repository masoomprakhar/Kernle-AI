"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { formatDate, formatPercent, labelOf } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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
    notFound?: boolean;
    conflict?: boolean;
    conflictGroupId?: string | null;
  } | null;
};

type Attr = {
  id: string;
  code: string;
  type: string;
  label?: unknown;
  groupId?: string | null;
};

type Category = { id: string; code: string; label?: unknown; children?: Category[] };

type Product = {
  id: string;
  sku: string;
  enabled: boolean;
  values?: Record<string, unknown>;
  completeness?: Record<string, number>;
  geoScore?: number;
  geoBreakdown?: Record<string, number>;
  family?: {
    id: string;
    code: string;
    label?: unknown;
    attributes?: Array<{ attribute: Attr; sortOrder?: number }>;
  };
  categories?: Array<{ categoryId: string; category: Category }>;
  assetLinks?: Array<{
    id: string;
    role?: string;
    asset: { id: string; filename?: string; originalName?: string; mimeType?: string; url?: string; signedUrl?: string };
  }>;
  comments?: Array<{ id: string; body?: string; content?: string; createdAt: string; authorId?: string }>;
};

type Group = { id: string; code: string; label?: unknown };

function flattenCategories(nodes: Category[], depth = 0): Array<Category & { depth: number }> {
  const out: Array<Category & { depth: number }> = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) out.push(...flattenCategories(n.children, depth + 1));
  }
  return out;
}

function readAttrValue(values: Record<string, unknown> | undefined, code: string): string {
  const raw = values?.[code];
  if (raw == null) return "";
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    const first = raw[0] as { data?: unknown } | undefined;
    if (first && typeof first === "object" && "data" in first) return String(first.data ?? "");
    return JSON.stringify(raw);
  }
  if (typeof raw === "object" && raw && "data" in (raw as object)) {
    return String((raw as { data: unknown }).data ?? "");
  }
  return JSON.stringify(raw);
}

function suggestionPreview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value && "not_found_in_source" in (value as object)) {
    return "not found in source";
  }
  if (typeof value === "object" && value) {
    const scoped = value as Record<string, Record<string, string>>;
    const firstChannel = Object.values(scoped)[0];
    if (firstChannel && typeof firstChannel === "object") {
      const first = Object.values(firstChannel)[0];
      if (first != null) return String(first);
    }
  }
  return String(value);
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [fromSource, setFromSource] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function loadSuggestions() {
    try {
      const rows = await api<Suggestion[]>(
        `/ai/suggestions?status=pending&productId=${params.id}`,
      );
      setSuggestions(rows || []);
    } catch {
      setSuggestions([]);
    }
  }

  async function load() {
    setError("");
    try {
      const [p, g, cats] = await Promise.all([
        api<Product>(`/pim/products/${params.id}`),
        api<Group[]>("/pim/attribute-groups").catch(() => []),
        api<Category[]>("/pim/categories?tree=true").catch(() => []),
      ]);
      setProduct(p);
      setGroups(g || []);
      setAllCategories(Array.isArray(cats) ? cats : []);
      setEnabled(p.enabled);
      setSelectedCats(new Set((p.categories || []).map((c) => c.categoryId)));
      const next: Record<string, string> = {};
      for (const fa of p.family?.attributes || []) {
        next[fa.attribute.code] = readAttrValue(p.values, fa.attribute.code);
      }
      setDraft(next);
      await loadSuggestions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load product");
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFromSource(new URLSearchParams(window.location.search).get("fromSource") === "1");
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function resolveSuggestion(id: string, action: "accept" | "reject") {
    setResolvingId(id);
    setError("");
    setMessage("");
    try {
      await api(`/ai/suggestions/${id}/${action}`, { method: "POST" });
      setMessage(action === "accept" ? "Suggestion accepted" : "Suggestion rejected");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve suggestion");
    } finally {
      setResolvingId(null);
    }
  }

  const attrsByGroup = useMemo(() => {
    const attrs = (product?.family?.attributes || []).map((a) => a.attribute);
    const map = new Map<string, Attr[]>();
    for (const a of attrs) {
      const key = a.groupId || "_ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [product]);

  const completenessData = useMemo(() => {
    const entries = Object.entries(product?.completeness || {});
    if (!entries.length) return [{ name: "Empty", value: 100 }];
    const avg = entries.reduce((a, [, v]) => a + v, 0) / entries.length;
    return [
      { name: "Complete", value: Math.round(avg) },
      { name: "Missing", value: Math.max(0, 100 - Math.round(avg)) },
    ];
  }, [product]);

  const avgCompleteness = completenessData[0]?.name === "Complete" ? completenessData[0].value : 0;

  async function saveValues() {
    if (!product) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const values: Record<string, unknown> = {};
      for (const [code, data] of Object.entries(draft)) {
        values[code] = [{ locale: null, scope: null, data }];
      }
      await api(`/pim/products/${product.id}`, {
        method: "PATCH",
        body: { values, merge: true, enabled },
      });
      await api(`/pim/products/${product.id}/categories`, {
        method: "POST",
        body: { categoryIds: Array.from(selectedCats), mode: "replace" },
      });
      await api(`/pim/products/${product.id}/recompute-completeness`, { method: "POST" });
      setMessage("Saved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!product && !error) {
    return <p className="text-sm text-muted-foreground">Loading product…</p>;
  }

  if (!product) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const flatCats = flattenCategories(allCategories);

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold">{product.sku}</h1>
            <Badge variant="secondary">GEO {product.geoScore ?? "—"}</Badge>
          </div>
          <p className="text-muted-foreground">
            {product.family ? labelOf(product.family.label) || product.family.code : "No family"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="enabled" />
            <Label htmlFor="enabled">Enabled</Label>
          </div>
          <Button onClick={() => void saveValues()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      {(fromSource || suggestions.length > 0) && (
        <Card className="border-ink/15 bg-surface-soft/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {fromSource ? "Source extraction review" : "Pending AI suggestions"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Proposed values are never written until you Accept.{" "}
              <Link href="/ai" className="underline underline-offset-2">
                Open AI Insights
              </Link>
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!suggestions.length && (
              <p className="text-sm text-muted-foreground">No pending suggestions for this product.</p>
            )}
            {suggestions.map((s) => {
              const notFound = Boolean(
                s.explanation?.notFound ||
                  (s.suggestedValue &&
                    typeof s.suggestedValue === "object" &&
                    "not_found_in_source" in (s.suggestedValue as object)),
              );
              const isConflict = Boolean(s.explanation?.conflict);
              return (
                <div
                  key={s.id}
                  className={`flex flex-col gap-2 rounded-md border bg-background px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
                    isConflict ? "border-amber-300" : "border-border"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.attributeCode}</span>
                      <Badge variant="outline">{s.confidence || "—"}</Badge>
                      {s.source && <Badge variant="secondary">{s.source}</Badge>}
                      {isConflict && <Badge variant="outline">conflict — pick one</Badge>}
                      {notFound && <Badge variant="danger">not found</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground break-words">
                      {suggestionPreview(s.suggestedValue)}
                    </p>
                    {s.explanation?.reason && (
                      <p className="text-xs text-muted-foreground">{s.explanation.reason}</p>
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
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Tabs defaultValue="attributes">
          <TabsList>
            <TabsTrigger value="attributes">Attributes</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
          </TabsList>

          <TabsContent value="attributes" className="space-y-4">
            {!product.family?.attributes?.length && (
              <p className="text-sm text-muted-foreground">Assign a family with attributes to edit values.</p>
            )}
            {Array.from(attrsByGroup.entries()).map(([groupId, attrs]) => {
              const group = groups.find((g) => g.id === groupId);
              return (
                <Card key={groupId}>
                  <CardHeader>
                    <CardTitle className="font-sans text-base">
                      {group ? labelOf(group.label) || group.code : "Ungrouped"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {attrs.map((a) => (
                      <div key={a.id} className="space-y-2">
                        <Label>{labelOf(a.label) || a.code}</Label>
                        {a.type === "textarea" ? (
                          <Textarea
                            value={draft[a.code] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [a.code]: e.target.value }))}
                          />
                        ) : (
                          <Input
                            value={draft[a.code] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [a.code]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="categories">
            <Card>
              <CardContent className="space-y-2 pt-6">
                {flatCats.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 text-sm"
                    style={{ paddingLeft: c.depth * 16 }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCats.has(c.id)}
                      onChange={(e) => {
                        setSelectedCats((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        });
                      }}
                    />
                    {labelOf(c.label) || c.code}
                  </label>
                ))}
                {!flatCats.length && (
                  <p className="text-sm text-muted-foreground">No categories yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(product.assetLinks || []).map((link) => (
                <div key={link.id} className="overflow-hidden rounded-lg border bg-muted/40">
                  <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                    {link.asset.mimeType?.startsWith("image/") && (link.asset.url || link.asset.signedUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={link.asset.url || link.asset.signedUrl}
                        alt={link.asset.originalName || link.asset.filename || "asset"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      link.asset.originalName || link.asset.filename || "Asset"
                    )}
                  </div>
                  <div className="truncate px-2 py-1.5 text-xs">{link.role || "media"}</div>
                </div>
              ))}
              {!product.assetLinks?.length && (
                <p className="col-span-full text-sm text-muted-foreground">
                  No linked assets. Upload from Assets and link to this product.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="comments">
            <Card>
              <CardContent className="space-y-3 pt-6">
                {(product.comments || []).map((c) => (
                  <div key={c.id} className="rounded-md border p-3 text-sm">
                    <p>{c.body || c.content || "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
                  </div>
                ))}
                {!product.comments?.length && (
                  <p className="text-sm text-muted-foreground">No comments on this product yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Completeness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={completenessData}
                      dataKey="value"
                      innerRadius={48}
                      outerRadius={70}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Cell fill="hsl(192 73% 21%)" />
                      <Cell fill="hsl(36 22% 84%)" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-center font-display text-title-lg text-ink">
                {formatPercent(avgCompleteness)}
              </p>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {Object.entries(product.completeness || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span>{formatPercent(v)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {product.geoBreakdown && (
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base">GEO breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(product.geoBreakdown).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
