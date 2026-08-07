"use client";

import { useEffect, useState } from "react";
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
  productId?: string;
  attributeCode?: string;
  proposedValue?: unknown;
  status?: string;
};

type Finding = {
  id: string;
  title?: string;
  message?: string;
  severity?: string;
  resolved?: boolean;
};

type Usage = {
  id?: string;
  action?: string;
  tokens?: number;
  createdAt?: string;
  model?: string;
};

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
    try {
      await api(`/ai/suggestions/${id}/${action}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function scan() {
    setInfo("");
    try {
      await api("/ai/quality/scan", { method: "POST" });
      setInfo("Quality scan enqueued");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">AI Insights</h1>
          <p className="text-muted-foreground">Ask Kernle, review enrichment, track quality.</p>
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
          {suggestions.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {s.attributeCode || "Suggestion"} · product {s.productId || "—"}
                  </p>
                  <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(s.proposedValue, null, 2)}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void decide(s.id, "accept")}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void decide(s.id, "reject")}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!suggestions.length && (
            <p className="text-sm text-muted-foreground">No pending suggestions. AI never auto-commits.</p>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-3">
          {findings.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{f.title || f.message || "Finding"}</p>
                  {f.message && f.title && (
                    <p className="mt-1 text-sm text-muted-foreground">{f.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={f.severity === "high" ? "danger" : "warning"}>
                    {f.severity || "info"}
                  </Badge>
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
          ))}
          {!findings.length && <p className="text-sm text-muted-foreground">No open findings.</p>}
        </TabsContent>

        <TabsContent value="usage" className="space-y-2">
          {usage.map((u, i) => (
            <Card key={u.id || i}>
              <CardContent className="flex justify-between py-3 text-sm">
                <span>
                  {u.action || "call"} {u.model ? `· ${u.model}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {u.tokens ?? "—"} tokens · {formatDate(u.createdAt)}
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
