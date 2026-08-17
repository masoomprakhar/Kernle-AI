"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function AskKernleWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Ask Kernle about catalog quality, attributes, or enrichment ideas.",
    },
  ]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await api<{
        reply?: string;
        answer?: string;
        conversationId?: string;
        message?: string;
      }>("/ai/ask", {
        method: "POST",
        body: { message: text, conversationId },
      });
      if (res.conversationId) setConversationId(res.conversationId);
      const reply = res.reply || res.answer || res.message || "No response.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {open && (
        <div className="flex h-[min(420px,70dvh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-hairline bg-canvas animate-fade-in">
          <div className="flex items-center justify-between border-b border-hairline bg-ink px-4 py-3 text-white">
            <div>
              <p className="font-display text-title-sm">Ask Kernle</p>
              <p className="text-caption text-white/80">Catalog assistant</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white active:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] rounded-md px-3 py-2 text-body-md",
                  m.role === "user" ? "ml-auto bg-ink text-white" : "bg-surface-soft text-body",
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
          <div className="border-t border-hairline p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about products, completeness…"
                className="min-h-[44px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button size="icon" variant="icon" onClick={() => void send()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
      <Button onClick={() => setOpen((v) => !v)} className="shadow-cta-soft">
        <MessageCircle className="h-4 w-4" />
        Ask Kernle
      </Button>
    </div>
  );
}
