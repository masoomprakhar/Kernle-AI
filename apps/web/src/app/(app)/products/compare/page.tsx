"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CompareResult = {
  products: Array<{
    id: string;
    sku: string;
    values: Record<string, string>;
  }>;
  differingFields: Array<{ code: string; a: string; b: string }>;
};

function CompareInner() {
  const search = useSearchParams();
  const ids = (search.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const [data, setData] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ids.length < 2) {
      setError("Provide at least two product ids via ?ids=a,b");
      return;
    }
    api<CompareResult>("/ai/products/compare", {
      method: "POST",
      body: { productIds: ids },
    })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Compare failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const codes = data
    ? Array.from(new Set(data.products.flatMap((p) => Object.keys(p.values || {})))).sort()
    : [];
  const diffSet = new Set((data?.differingFields || []).map((d) => d.code));

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/ai"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          AI Insights
        </Link>
        <h1 className="font-display text-3xl font-semibold">Compare products</h1>
        <p className="text-muted-foreground">Side-by-side attribute diff for near-duplicate review.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {data.products.map((p) => p.sku).join(" vs ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Attribute</th>
                  {data.products.map((p) => (
                    <th key={p.id} className="py-2 pr-4 font-medium">
                      <Link href={`/products/${p.id}`} className="underline underline-offset-2">
                        {p.sku}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code} className={`border-b border-border/60 ${diffSet.has(code) ? "bg-amber-50/80" : ""}`}>
                    <td className="py-2 pr-4 align-top">
                      <span className="font-medium">{code}</span>
                      {diffSet.has(code) && (
                        <Badge variant="outline" className="ml-2">
                          differs
                        </Badge>
                      )}
                    </td>
                    {data.products.map((p) => (
                      <td key={p.id} className="py-2 pr-4 align-top text-muted-foreground">
                        {p.values[code] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProductComparePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading compare…</p>}>
      <CompareInner />
    </Suspense>
  );
}
