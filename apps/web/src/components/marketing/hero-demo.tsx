"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type PromptId =
  | "blocking"
  | "enrich"
  | "industrial"
  | "incomplete";

type Msg = { who: "you" | "kernle"; text: string };

type Row = {
  name: string;
  sku: string;
  family: string;
  pct: number;
  status: string;
};

const PROMPTS: { id: PromptId; label: string }[] = [
  { id: "blocking", label: "Which SKUs are blocking publish?" },
  { id: "enrich", label: "What should I enrich today?" },
  { id: "industrial", label: "Clean these distributor part descs" },
  { id: "incomplete", label: "Show incomplete Apparel records" },
];

const THREADS: Record<PromptId, Msg[]> = {
  blocking: [
    { who: "you", text: "Which SKUs are blocking publish?" },
    {
      who: "kernle",
      text: "3 products are below channel readiness for Ecommerce · en_US.",
    },
    {
      who: "kernle",
      text: "Day Pack (48%) missing weight + material. Merino Jacket (71%) thin description. Trail Bottle (62%) missing packshot. Nothing auto-committed — open Accept when ready.",
    },
  ],
  enrich: [
    { who: "you", text: "What should I enrich today?" },
    {
      who: "kernle",
      text: "12 records have high-confidence AI drafts waiting for review.",
    },
    {
      who: "kernle",
      text: "Start with Merino Jacket — material, care, and short description are ready to Accept. Industrial queue: 50 faucet/fitting SKUs with LOV-checked drafts.",
    },
  ],
  industrial: [
    { who: "you", text: "Clean these distributor part descs" },
    {
      who: "kernle",
      text: "Running industrial enrichment on abbreviated Part_Desc rows — brand aliases, UOM fractions, and LOV finishes.",
    },
    {
      who: "kernle",
      text: "UNI-FCT-001 → MOEN®, Chrome, Pull-Down, 1.5 gpm. UNI-FIT-003 → brass 3/4 in elbow, Sweat. Suggestions are queued for Accept — live values stay untouched until you decide.",
    },
  ],
  incomplete: [
    { who: "you", text: "Show incomplete Apparel records" },
    {
      who: "kernle",
      text: "8 Apparel products under 80% completeness (getIncompleteProducts).",
    },
    {
      who: "kernle",
      text: "Top impact: Merino Jacket, Softshell Vest, Linen Shirt — ranked by channel traffic. Want me to draft fills for the gaps?",
    },
  ],
};

const ROWS_BY_PROMPT: Record<PromptId, { readiness: number; channel: string; rows: Row[] }> = {
  blocking: {
    readiness: 72,
    channel: "Ecommerce · en_US",
    rows: [
      { name: "Air Runner", sku: "SNK-AIR-01", family: "Footwear", pct: 96, status: "Ready" },
      { name: "Merino Jacket", sku: "JKT-WOOL-12", family: "Apparel", pct: 71, status: "Review" },
      { name: "Day Pack", sku: "BAG-NYL-04", family: "Bags", pct: 48, status: "Blocked" },
      { name: "Trail Cap", sku: "HAT-TRL-09", family: "Accessories", pct: 88, status: "Ready" },
    ],
  },
  enrich: {
    readiness: 78,
    channel: "Ecommerce · en_US",
    rows: [
      { name: "Merino Jacket", sku: "JKT-WOOL-12", family: "Apparel", pct: 71, status: "Drafts" },
      { name: "Softshell Vest", sku: "VST-SFT-03", family: "Apparel", pct: 74, status: "Drafts" },
      { name: "Day Pack", sku: "BAG-NYL-04", family: "Bags", pct: 48, status: "Blocked" },
      { name: "Trail Bottle", sku: "BTL-TRL-02", family: "Accessories", pct: 62, status: "Review" },
    ],
  },
  industrial: {
    readiness: 41,
    channel: "Distributor · en_US",
    rows: [
      { name: "Kit faucet chrome", sku: "UNI-FCT-001", family: "Faucet", pct: 22, status: "Messy" },
      { name: "Pull-dn brsh nckl", sku: "UNI-FCT-002", family: "Faucet", pct: 18, status: "Messy" },
      { name: "3/4×1/2 ell brs", sku: "UNI-FIT-001", family: "Fitting", pct: 25, status: "Messy" },
      { name: "1/2 cplg swt", sku: "UNI-FIT-003", family: "Fitting", pct: 20, status: "Messy" },
    ],
  },
  incomplete: {
    readiness: 68,
    channel: "Ecommerce · en_US",
    rows: [
      { name: "Merino Jacket", sku: "JKT-WOOL-12", family: "Apparel", pct: 71, status: "Review" },
      { name: "Softshell Vest", sku: "VST-SFT-03", family: "Apparel", pct: 64, status: "Review" },
      { name: "Linen Shirt", sku: "SHT-LIN-08", family: "Apparel", pct: 58, status: "Blocked" },
      { name: "Trail Cap", sku: "HAT-TRL-09", family: "Accessories", pct: 88, status: "Ready" },
    ],
  },
};

function replyForFreeText(text: string): Msg[] {
  const lower = text.toLowerCase();
  if (
    lower.includes("faucet") ||
    lower.includes("fitting") ||
    lower.includes("distributor") ||
    lower.includes("unilog") ||
    lower.includes("part desc") ||
    lower.includes("industrial")
  ) {
    return [
      { who: "you", text },
      {
        who: "kernle",
        text: "Industrial enrichment maps abbreviated Part_Desc → brand master, LOV finish/material, and UOM-normalized size. Proposals land in the Accept queue — never auto-written to live SKUs.",
      },
      {
        who: "kernle",
        text: "Try the guided path: Intelligence → Industrial enrichment. Or ask me which UNI-* SKUs still need Accept.",
      },
    ];
  }
  if (lower.includes("incomplete") || lower.includes("completeness") || lower.includes("blocking")) {
    return [
      { who: "you", text },
      {
        who: "kernle",
        text: "I can list products under a completeness threshold with getIncompleteProducts (channel + locale). Typical blockers: missing media, thin descriptions, empty required attributes.",
      },
      {
        who: "kernle",
        text: "Nothing ships until a human Accepts. Want the Apparel under-80% list, or the distributor faucet slice?",
      },
    ];
  }
  if (lower.includes("enrich") || lower.includes("suggest") || lower.includes("accept")) {
    return [
      { who: "you", text },
      {
        who: "kernle",
        text: "Ask Kernle drafts attribute fills with explanations and self-checks. High-confidence rows are ready for Accept; LOV mismatches get flagged as needs attention.",
      },
      {
        who: "kernle",
        text: "Open AI Insights for the full queue, or Product Intelligence for source → extract → Accept.",
      },
    ];
  }
  return [
    { who: "you", text },
    {
      who: "kernle",
      text: "I help with catalog search, completeness, and Accept-gated enrichment. Try: “Which SKUs are blocking publish?” or “Clean these distributor part descs.”",
    },
    {
      who: "kernle",
      text: "Tools stay constrained — searchProducts, getIncompleteProducts, countByFamily. No raw SQL. No silent writes.",
    },
  ];
}

export function HeroDemo() {
  const [promptId, setPromptId] = useState<PromptId>("blocking");
  const [thread, setThread] = useState<Msg[]>(THREADS.blocking);
  const [visible, setVisible] = useState(1);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [customPanel, setCustomPanel] = useState<PromptId | null>(null);

  useEffect(() => {
    setVisible(1);
    setTyping(true);
    const total = thread.length;
    const timers: number[] = [];
    for (let i = 2; i <= total; i++) {
      timers.push(
        window.setTimeout(() => {
          setVisible(i);
          if (i === total) setTyping(false);
        }, (i - 1) * 650),
      );
    }
    if (total <= 1) setTyping(false);
    return () => timers.forEach(clearTimeout);
  }, [thread]);

  const panelKey = customPanel || promptId;
  const panel = ROWS_BY_PROMPT[panelKey];
  const messages = useMemo(() => thread.slice(0, visible), [thread, visible]);

  function runPrompt(id: PromptId) {
    setPromptId(id);
    setCustomPanel(null);
    setThread(THREADS[id]);
    setInput("");
  }

  function sendFreeText() {
    const text = input.trim();
    if (!text || typing) return;
    const next = replyForFreeText(text);
    setInput("");
    setThread(next);
    setCustomPanel(
      /faucet|fitting|distributor|industrial|part desc|uni-/i.test(text)
        ? "industrial"
        : /incomplete|apparel/i.test(text)
          ? "incomplete"
          : /enrich|accept|draft/i.test(text)
            ? "enrich"
            : "blocking",
    );
  }

  return (
    <div className="mkt-stage overflow-hidden rounded-lg border border-hairline bg-canvas shadow-cta-soft">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden h-2.5 w-2.5 rounded-full bg-surface-strong sm:inline-block" />
          <span className="hidden h-2.5 w-2.5 rounded-full bg-surface-strong sm:inline-block" />
          <span className="hidden h-2.5 w-2.5 rounded-full bg-surface-strong sm:inline-block" />
          <span className="truncate text-[12px] font-medium text-ink sm:ml-2 sm:text-[13px]">
            Catalog workspace
          </span>
        </div>
        <span className="shrink-0 rounded-pill bg-surface-soft px-2 py-1 text-[10px] font-medium text-muted-foreground sm:px-2.5 sm:text-[11px]">
          Ask Kernle · demo
        </span>
      </div>

      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col border-b border-hairline p-3 sm:p-4 md:p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Ask Kernle
              </p>
              <p className="mt-1 text-[12px] text-body sm:text-[13px]">
                Constrained catalog AI — search, completeness, Accept-gated enrichment.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-link hover:underline"
            >
              Try live
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {PROMPTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => runPrompt(item.id)}
                className={cn(
                  "shrink-0 rounded-pill bg-canvas px-3 py-1.5 text-[12px] font-medium text-body shadow-[0_1px_2px_rgba(24,29,38,0.06),0_4px_12px_rgba(24,29,38,0.06)] transition-[box-shadow,color]",
                  promptId === item.id && !customPanel
                    ? "text-ink shadow-[0_1px_2px_rgba(24,29,38,0.08),0_6px_16px_rgba(24,29,38,0.1)]"
                    : "hover:shadow-[0_1px_2px_rgba(24,29,38,0.08),0_6px_16px_rgba(24,29,38,0.1)]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-[180px] flex-1 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={`${msg.who}-${i}-${msg.text.slice(0, 24)}`}
                className={cn(
                  "mkt-msg max-w-[92%] rounded-md bg-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-ink shadow-[0_1px_2px_rgba(24,29,38,0.06),0_4px_12px_rgba(24,29,38,0.08)]",
                  msg.who === "you" ? "ml-auto" : "",
                )}
              >
                {msg.who === "kernle" && (
                  <p className="mb-1 text-[11px] font-medium text-link">Kernle</p>
                )}
                {msg.text}
              </div>
            ))}
            {typing && (
              <div className="mkt-msg flex max-w-[40%] items-center gap-2 rounded-md bg-canvas px-3.5 py-2.5 text-[12px] text-muted-foreground shadow-[0_1px_2px_rgba(24,29,38,0.06),0_4px_12px_rgba(24,29,38,0.08)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-link" />
                Thinking…
              </div>
            )}
          </div>

          <form
            className="mt-4 flex items-end gap-2 border-t border-hairline pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendFreeText();
            }}
          >
            <label className="sr-only" htmlFor="ask-kernle-hero">
              Ask Kernle
            </label>
            <input
              id="ask-kernle-hero"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about completeness or enrichment…"
              className="h-10 min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-muted-foreground focus:border-ink/30"
              disabled={typing}
            />
            <button
              type="submit"
              disabled={typing || !input.trim()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white transition-opacity disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="bg-surface-soft/60 p-3 sm:p-4 md:p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-muted-foreground">Channel readiness</p>
              <p className="mt-0.5 truncate text-[14px] font-medium tracking-[-0.02em] text-ink sm:text-[16px]">
                {panel.channel}
              </p>
            </div>
            <p className="shrink-0 font-display text-[28px] leading-none tracking-[-0.03em] text-link sm:text-[36px]">
              {panel.readiness}%
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-hairline bg-canvas">
            <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-hairline bg-surface-soft px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:grid-cols-[1.3fr_0.7fr_0.5fr]">
              <span>Product</span>
              <span className="hidden sm:inline">Family</span>
              <span>Score</span>
            </div>
            {panel.rows.map((row) => (
              <div
                key={row.sku}
                className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-hairline px-3 py-3 last:border-b-0 sm:grid-cols-[1.3fr_0.7fr_0.5fr]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    <span className="sm:hidden">{row.family} · </span>
                    {row.sku}
                  </p>
                </div>
                <p className="hidden truncate text-[12px] text-body sm:block">{row.family}</p>
                <div>
                  <p className="text-[12px] font-medium tabular-nums text-ink">{row.pct}%</p>
                  <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-surface-soft sm:w-14">
                    <div className="h-full rounded-full bg-link" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Demo replies mirror Ask Kernle tools. Sign in for live{" "}
            <Link href="/login" className="font-medium text-link hover:underline">
              /ai
            </Link>{" "}
            chat against your catalog.
          </p>
        </div>
      </div>
    </div>
  );
}
