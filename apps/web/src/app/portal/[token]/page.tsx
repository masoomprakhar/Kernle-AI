"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PortalProduct = {
  id?: string;
  sku: string;
  values?: Record<string, unknown>;
};

export default function SupplierPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [sku, setSku] = useState("");
  const [payload, setPayload] = useState('{\n  "name": ""\n}');
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/suppliers/portal/products?token=${encodeURIComponent(token)}`, {
        headers: { "x-portal-token": token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load portal");
      setProducts(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      let submittedValues: Record<string, unknown>;
      try {
        submittedValues = JSON.parse(payload);
      } catch {
        throw new Error("Submitted values must be valid JSON");
      }
      const res = await fetch(`${API_BASE}/suppliers/portal/submit?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-token": token,
        },
        body: JSON.stringify({ productSku: sku, submittedValues }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Submit failed");
      setMessage("Submission sent for review");
      setSku("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_hsl(36_40%_88%),_transparent_55%)]">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 animate-fade-in">
        <div>
          <BrandLogo size="lg" priority />
          <h1 className="mt-1 font-display text-2xl font-medium">Supplier portal</h1>
          <p className="text-sm text-muted-foreground">Submit product content for catalog review.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base">Assigned products</CardTitle>
            <CardDescription>Reference SKUs available to your supplier account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {products.map((p) => (
              <button
                key={p.sku}
                type="button"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => setSku(p.sku)}
              >
                <span className="font-medium">{p.sku}</span>
                <span className="text-xs text-muted-foreground">Use SKU</span>
              </button>
            ))}
            {!loading && !products.length && (
              <p className="text-sm text-muted-foreground">No products listed for this portal token.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base">Submit content</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label>Product SKU</Label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Submitted values (JSON)</Label>
                <Textarea
                  className="min-h-[160px] font-mono text-xs"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  required
                />
              </div>
              <Button type="submit">Submit for review</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
