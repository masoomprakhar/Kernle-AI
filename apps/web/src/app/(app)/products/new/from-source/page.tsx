"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, FileUp, Link2, Type } from "lucide-react";
import { api } from "@/lib/api";
import { labelOf } from "@/lib/utils";
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

export default function ProductFromSourcePage() {
  const router = useRouter();
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
  const [step, setStep] = useState<"sources" | "extracting">("sources");

  useEffect(() => {
    api<Family[]>("/pim/families")
      .then((f) => {
        setFamilies(f || []);
        if (f?.[0]) setFamilyId(f[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load families"));
  }, []);

  async function addUrl() {
    setError("");
    setBusy(true);
    try {
      const doc = await api<SourceDoc>("/ai/sources", {
        method: "POST",
        body: { type: "url", url },
      });
      setSources((s) => [...s, doc]);
      if (doc.status === "failed") {
        setError(doc.errorMessage || "URL fetch failed");
      }
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
    setStep("extracting");
    try {
      const result = await api<{ productId: string }>("/ai/extract", {
        method: "POST",
        body: {
          familyId,
          sourceDocumentIds: sources.map((s) => s.id),
          sku: sku.trim() || undefined,
        },
      });
      router.push(`/products/${result.productId}?fromSource=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setStep("sources");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/products"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Products
          </Link>
          <h1 className="font-display text-3xl font-semibold">New product from source</h1>
          <p className="text-muted-foreground">
            Add a URL, PDF, or pasted text. Kernle proposes attribute values — you Accept before anything is saved.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
                    <Badge variant={s.status === "parsed" ? "secondary" : "destructive"}>{s.status}</Badge>
                    <span className="text-muted-foreground truncate">
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
          {step === "extracting" ? "Extracting…" : "Extract & open product"}
        </Button>
      </div>
    </div>
  );
}
