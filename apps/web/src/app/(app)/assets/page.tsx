"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Asset = {
  id: string;
  originalName?: string;
  filename?: string;
  mimeType?: string;
  url?: string;
  signedUrl?: string;
  tags?: string[];
};

export default function AssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(q = search) {
    try {
      const qs = new URLSearchParams({ pageSize: "60" });
      if (q) qs.set("search", q);
      const data = await api<{ items?: Asset[] } | Asset[]>(`/dam/assets?${qs}`);
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assets");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        await api("/dam/assets/upload", { method: "POST", formData: fd });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Assets</h1>
          <p className="text-muted-foreground">Digital asset library for product media.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => void onUpload(e.target.files)}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search assets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Search
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((a) => {
          const src = a.url || a.signedUrl;
          const name = a.originalName || a.filename || a.id;
          return (
            <Card key={a.id} className="overflow-hidden">
              <div className="flex aspect-square items-center justify-center bg-muted/50 text-xs text-muted-foreground">
                {a.mimeType?.startsWith("image/") && src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={name} className="h-full w-full object-cover" />
                ) : (
                  name
                )}
              </div>
              <CardContent className="space-y-1 p-3">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {(a.tags || []).join(", ") || a.mimeType || "—"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!items.length && <p className="text-sm text-muted-foreground">No assets yet. Upload to get started.</p>}
    </div>
  );
}
