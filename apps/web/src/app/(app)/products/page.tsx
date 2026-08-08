"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
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
  const [sku, setSku] = useState("");
  const [createFamilyId, setCreateFamilyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const vals = Object.values(p.completeness || {});
          const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          return (
            <Link key={p.id} href={`/products/${p.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-sans text-base">{p.sku}</CardTitle>
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
            </Link>
          );
        })}
      </div>
      {!loading && !items.length && (
        <p className="text-sm text-muted-foreground">No products match these filters.</p>
      )}
    </div>
  );
}
