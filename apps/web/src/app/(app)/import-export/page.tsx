"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type Job = {
  id: string;
  status?: string;
  createdAt?: string;
  filename?: string;
  errorCount?: number;
  successCount?: number;
};

type Family = { id: string; code: string; label?: unknown };

export default function ImportExportPage() {
  const [csvText, setCsvText] = useState("sku,name\nDEMO-1,Demo Product");
  const [behavior, setBehavior] = useState("upsert");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [exportFamily, setExportFamily] = useState("all");
  const [exportResult, setExportResult] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profileName, setProfileName] = useState("");

  async function loadJobs() {
    try {
      const [j, f] = await Promise.all([
        api<Job[]>("/import-export/import/jobs").catch(() => []),
        api<Family[]>("/pim/families").catch(() => []),
      ]);
      setJobs(Array.isArray(j) ? j : []);
      setFamilies(Array.isArray(f) ? f : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  async function runImport() {
    setError("");
    setMessage("");
    try {
      await api("/import-export/import/csv", {
        method: "POST",
        body: {
          csvText,
          updateBehavior: behavior,
        },
      });
      setMessage("Import job queued");
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setCsvText(await file.text());
  }

  async function runExport() {
    setError("");
    try {
      const res = await api<{ csv?: string; content?: string; downloadUrl?: string }>(
        "/import-export/export/csv",
        {
          method: "POST",
          body: {
            filter: exportFamily === "all" ? undefined : { familyId: exportFamily },
            fields: ["sku", "enabled", "familyId"],
          },
        },
      );
      setExportResult(res.csv || res.content || res.downloadUrl || JSON.stringify(res, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function saveProfile() {
    if (!profileName.trim()) return;
    try {
      await api("/import-export/profiles", {
        method: "POST",
        body: { name: profileName, updateBehavior: behavior, sourceType: "csv" },
      });
      setMessage("Import profile saved");
      setProfileName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profile save failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold">Import / Export</h1>
        <p className="text-muted-foreground">CSV workflows and job history.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="jobs">Job history</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">CSV import wizard</CardTitle>
              <CardDescription>Paste CSV or upload a file, then choose update behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Upload CSV</Label>
                <Input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0] || null)} />
              </div>
              <div className="space-y-2">
                <Label>CSV text</Label>
                <Textarea className="min-h-[180px] font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={behavior} onValueChange={setBehavior}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upsert">Upsert</SelectItem>
                    <SelectItem value="create_only">Create only</SelectItem>
                    <SelectItem value="update_only">Update only</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => void runImport()}>Start import</Button>
              </div>
              <div className="flex gap-2 border-t pt-4">
                <Input
                  placeholder="Save as profile name…"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
                <Button variant="secondary" onClick={() => void saveProfile()}>
                  Save profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Export builder</CardTitle>
              <CardDescription>Filter by family and download CSV content.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={exportFamily} onValueChange={setExportFamily}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Family filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All families</SelectItem>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void runExport()}>Run export</Button>
              {exportResult && (
                <Textarea className="min-h-[200px] font-mono text-xs" value={exportResult} readOnly />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-2">
          {jobs.map((j) => (
            <Card key={j.id}>
              <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
                <div>
                  <p className="font-medium">{j.filename || j.id}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(j.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    ok {j.successCount ?? "—"} / err {j.errorCount ?? "—"}
                  </span>
                  <Badge variant={j.status === "failed" ? "danger" : "secondary"}>{j.status || "unknown"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {!jobs.length && <p className="text-sm text-muted-foreground">No import jobs yet.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
