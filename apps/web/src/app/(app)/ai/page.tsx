"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Suggestion = {
  id: string;
  productId?: string | null;
  attributeCode?: string | null;
  suggestedValue?: unknown;
  confidence?: string;
  source?: string;
  explanation?: {
    reason?: string;
    conflict?: boolean;
    conflictGroupId?: string | null;
    notFound?: boolean;
  } | null;
  product?: { id: string; sku: string };
};

type Finding = {
  id: string;
  title?: string;
  description?: string;
  message?: string;
  severity?: string;
  category?: string;
  resolved?: boolean;
  fixAction?: {
    type?: string;
    productIds?: string[];
    mapping?: Record<string, string>;
    canonical?: string;
  } | null;
};

type Usage = {
  id?: string;
  operation?: string;
  action?: string;
  tokensIn?: number;
  tokensOut?: number;
  tokens?: number;
  createdAt?: string;
};

function previewValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value && "not_found_in_source" in (value as object)) {
    return "not found in source";
  }
  if (typeof value === "object" && value) {
    const scoped = value as Record<string, Record<string, string>>;
    const first = Object.values(scoped)[0];
    if (first && typeof first === "object") {
      const v = Object.values(first)[0];
      if (v != null) return String(v);
    }
  }
  return String(value);
}

export default function AiPage() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Array<{ role: string; content: string }>>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    try {
      const [s, f, u] = await Promise.all([
        api<Suggestion[]>("/ai/suggestions?status=pending").catch(() => []),
        api<Finding[]>("/ai/quality/findings?resolved=false").catch(() => []),
        api<Usage[]>("/ai/usage").catch(() => []),
      ]);
      setSuggestions(Array.isArray(s) ? s : []);
      setFindings(Array.isArray(f) ? f : []);
      setUsage(Array.isArray(u) ? u : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI data");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const conflictGroups = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const s of suggestions) {
      const gid = s.explanation?.conflictGroupId;
      if (s.explanation?.conflict && gid) {
        const list = map.get(gid) || [];
        list.push(s);
        map.set(gid, list);
      }
    }
    return map;
  }, [suggestions]);

  const plainSuggestions = suggestions.filter(
    (s) => !(s.explanation?.conflict && s.explanation?.conflictGroupId),
  );

  async function ask() {
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    setChat((c) => [...c, { role: "user", content: text }]);
    setMessage("");
    try {
      const res = await api<{ reply?: string; answer?: string; conversationId?: string; message?: string }>(
        "/ai/ask",
        { method: "POST", body: { message: text, conversationId } },
      );
      if (res.conversationId) setConversationId(res.conversationId);
      setChat((c) => [...c, { role: "assistant", content: res.reply || res.answer || res.message || "—" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "accept" | "reject") {
    setActing(id);
    try {
      await api(`/ai/suggestions/${id}/${action}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  async function scan() {
    setInfo("");
    try {
      const res = await api<{ findingsCreated?: number }>("/ai/quality/scan", { method: "POST" });
      setInfo(`Quality scan complete — ${res.findingsCreated ?? "?"} findings`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    }
  }

  async function mergeFinding(id: string) {
    setActing(id);
    setError("");
    try {
      const res = await api<{ merged: number }>(`/ai/quality/findings/${id}/merge`, {
        method: "POST",
      });
      setInfo(`Merged ${res.merged} product values to canonical`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">AI Insights</h1>
          <p className="text-muted-foreground">
            Ask Kernle, resolve source conflicts, and keep catalog consistency.
          </p>
        </div>
        <Button variant="outline" onClick={() => void scan()}>
          <Sparkles className="h-4 w-4" />
          Run quality scan
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-emerald-700 dark:text-emerald-300">{info}</p>}

      <Tabs defaultValue="ask">
        <TabsList>
          <TabsTrigger value="ask">Ask Kernle</TabsTrigger>
          <TabsTrigger value="queue">Enrichment queue</TabsTrigger>
          <TabsTrigger value="insights">Insights feed</TabsTrigger>
          <TabsTrigger value="usage">AI usage</TabsTrigger>
        </TabsList>

        <TabsContent value="ask">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[240px] space-y-3 rounded-lg border bg-muted/30 p-4">
                {!chat.length && (
                  <p className="text-sm text-muted-foreground">
                    Ask about missing attributes, completeness gaps, or enrichment ideas.
                  </p>
                )}
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message Ask Kernle…"
                  className="min-h-[60px]"
                />
                <Button onClick={() => void ask()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-3">
          {[...conflictGroups.entries()].map(([gid, group]) => (
            <Card key={gid} className="border-amber-300/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Conflict — choose one value for {group[0]?.attributeCode}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sources disagree. Accepting one rejects the other candidates.
                  {group[0]?.product && (
                    <>
                      {" "}
                      <Link
                        href={`/products/${group[0].product.id}`}
                        className="underline underline-offset-2"
                      >
                        {group[0].product.sku}
                      </Link>
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{previewValue(s.suggestedValue)}</p>
                      <p className="text-xs text-muted-foreground">{s.explanation?.reason}</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={acting === s.id}
                      onClick={() => void decide(s.id, "accept")}
                    >
                      Choose this
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {plainSuggestions.map((s) => {
            const notFound = Boolean(s.explanation?.notFound);
            return (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      {s.attributeCode || "Suggestion"}
                      {s.product ? (
                        <>
                          {" · "}
                          <Link href={`/products/${s.product.id}`} className="underline underline-offset-2">
                            {s.product.sku}
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">{previewValue(s.suggestedValue)}</p>
                    {s.explanation?.reason && (
                      <p className="text-xs text-muted-foreground">{s.explanation.reason}</p>
                    )}
                    <div className="flex gap-2">
                      {s.confidence && <Badge variant="outline">{s.confidence}</Badge>}
                      {s.source && <Badge variant="secondary">{s.source}</Badge>}
                      {notFound && <Badge variant="danger">not found</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={acting === s.id || notFound}
                      onClick={() => void decide(s.id, "accept")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === s.id}
                      onClick={() => void decide(s.id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!suggestions.length && (
            <p className="text-sm text-muted-foreground">No pending suggestions. AI never auto-commits.</p>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-3">
          {findings.map((f) => {
            const fix = f.fixAction;
            const compareIds = fix?.type === "compare_products" ? fix.productIds || [] : [];
            const canMerge = fix?.type === "merge_to_canonical";
            return (
              <Card key={f.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-1 flex flex-wrap gap-2">
                      {f.category && <Badge variant="secondary">{f.category}</Badge>}
                      <Badge variant={f.severity === "high" ? "danger" : "outline"}>
                        {f.severity || "info"}
                      </Badge>
                    </div>
                    <p className="font-medium">{f.title || f.message || "Finding"}</p>
                    {(f.description || f.message) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {f.description || f.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canMerge && (
                      <Button
                        size="sm"
                        disabled={acting === f.id}
                        onClick={() => void mergeFinding(f.id)}
                      >
                        Merge to canonical
                      </Button>
                    )}
                    {compareIds.length >= 2 && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/products/compare?ids=${compareIds.join(",")}`}>Compare</Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void api(`/ai/quality/findings/${f.id}/resolve`, { method: "POST" }).then(load)
                      }
                    >
                      Resolve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!findings.length && <p className="text-sm text-muted-foreground">No open findings.</p>}
        </TabsContent>

        <TabsContent value="usage" className="space-y-2">
          {usage.map((u, i) => (
            <Card key={u.id || i}>
              <CardContent className="flex justify-between py-3 text-sm">
                <span>{u.operation || u.action || "call"}</span>
                <span className="text-muted-foreground">
                  {(u.tokensIn ?? 0) + (u.tokensOut ?? 0) || u.tokens || "—"} tokens ·{" "}
                  {formatDate(u.createdAt)}
                </span>
              </CardContent>
            </Card>
          ))}
          {!usage.length && (
            <p className="text-sm text-muted-foreground">Usage appears for Admin roles once AI is used.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
