"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatPercent, labelOf } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type Product = {
  id: string;
  sku: string;
  enabled: boolean;
  family?: { id: string; code: string; label?: unknown };
  completeness?: Record<string, number>;
  geoScore?: number;
};

type Family = { id: string; code: string; label?: unknown };

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState("");
  const [familyId, setFamilyId] = useState<string>("all");
  const [enabled, setEnabled] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sku, setSku] = useState("");
  const [createFamilyId, setCreateFamilyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkText, setBulkText] = useState(
    "Name: Catalog refresh\nColor: Midnight\nMaterial: Recycled mesh\nPrice: 149",
  );
  const [bulkUrl, setBulkUrl] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ pageSize: "48" });
      if (search) qs.set("search", search);
      if (familyId !== "all") qs.set("familyId", familyId);
      if (enabled !== "all") qs.set("enabled", enabled);
      const [list, fams] = await Promise.all([
        api<{ items: Product[]; total: number }>(`/pim/products?${qs}`),
        api<Family[]>("/pim/families"),
      ]);
      setItems(list.items || []);
      setTotal(list.total || 0);
      setFamilies(fams || []);
      setSelected((prev) => {
        const next = new Set<string>();
        Array.from(prev).forEach((id) => {
          if ((list.items || []).some((p) => p.id === id)) next.add(id);
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, enabled]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const ids = items.map((p) => p.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(allOn ? new Set() : new Set(ids));
  }

  async function createProduct() {
    try {
      const product = await api<Product>("/pim/products", {
        method: "POST",
        body: {
          sku,
          familyId: createFamilyId || undefined,
        },
      });
      setOpen(false);
      setSku("");
      setCreateFamilyId("");
      window.location.href = `/products/${product.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function runBulkIntelligence() {
    if (!selected.size) {
      setError("Select at least one product");
      return;
    }
    if (!bulkText.trim() && !bulkUrl.trim()) {
      setError("Provide paste text or a URL for the shared source");
      return;
    }
    setBulkBusy(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        productIds: Array.from(selected),
        async: true,
      };
      if (bulkUrl.trim()) {
        body.type = "url";
        body.url = bulkUrl.trim();
      } else {
        body.type = "text_paste";
        body.text = bulkText.trim();
      }
      const result = await api<{
        jobsEnqueued: number;
        batchCorrelationId: string;
        productCount: number;
      }>("/ai/intelligence/bulk-run", { method: "POST", body });
      setMessage(
        `Queued ${result.jobsEnqueued} intelligence jobs for ${result.productCount} products (corr ${result.batchCorrelationId.slice(0, 8)}). Review Accepts in AI Insights.`,
      );
      setBulkOpen(false);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk run failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Products</h1>
          <p className="text-muted-foreground">{total} in catalog</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/products/new/from-source">From source</Link>
          </Button>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" disabled={!selected.size}>
                <Sparkles className="h-4 w-4" />
                Intelligence run ({selected.size})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Bulk intelligence run</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Attach one source to {selected.size} selected products and enqueue extract →
                self-check → review queue. Values still require Accept.
              </p>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>Manufacturer URL (optional)</Label>
                  <Input
                    value={bulkUrl}
                    onChange={(e) => setBulkUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Or paste shared source text</Label>
                  <Textarea
                    rows={5}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    disabled={Boolean(bulkUrl.trim())}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={bulkBusy} onClick={() => void runBulkIntelligence()}>
                  {bulkBusy ? "Queueing…" : "Queue run"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create product</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Family</Label>
                  <Select value={createFamilyId} onValueChange={setCreateFamilyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
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
              </div>
              <DialogFooter>
                <Button onClick={() => void createProduct()} disabled={!sku.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search SKU or text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
        </div>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Family" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All families</SelectItem>
            {families.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {labelOf(f.label) || f.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={enabled} onValueChange={setEnabled}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="true">Enabled</SelectItem>
            <SelectItem value="false">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={() => void load()}>
          Apply
        </Button>
        <Button variant="outline" onClick={toggleAllVisible} disabled={!items.length}>
          {items.length && items.every((p) => selected.has(p.id)) ? "Clear" : "Select page"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const vals = Object.values(p.completeness || {});
          const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          const isSelected = selected.has(p.id);
          return (
            <Card
              key={p.id}
              className={`h-full transition-colors ${
                isSelected ? "border-ink/40 ring-1 ring-ink/20" : "hover:border-primary/40"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-ink"
                      checked={isSelected}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.sku}`}
                    />
                    <Link href={`/products/${p.id}`} className="min-w-0">
                      <CardTitle className="font-sans text-base hover:underline">{p.sku}</CardTitle>
                    </Link>
                  </label>
                  <Badge variant={p.enabled ? "success" : "secondary"}>
                    {p.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{p.family ? labelOf(p.family.label) || p.family.code : "No family"}</p>
                <div className="flex justify-between">
                  <span>Completeness</span>
                  <span className="font-medium text-foreground">{formatPercent(score)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GEO score</span>
                  <span className="font-medium text-foreground">{p.geoScore ?? "—"}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!loading && !items.length && (
        <p className="text-sm text-muted-foreground">No products match these filters.</p>
      )}
    </div>
  );
}
